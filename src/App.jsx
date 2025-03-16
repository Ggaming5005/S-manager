import React, { useState, useMemo } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useParams,
  Navigate,
} from "react-router-dom";
import { teachers } from "./data.js"; // Your teacher data

// English day keys used internally in data
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
// Georgian names for display
const georgianDays = {
  Monday: "ორშაბათი",
  Tuesday: "სამშაბათი",
  Wednesday: "ოთხშაბათი",
  Thursday: "ხუთშაბათი",
  Friday: "პარასკევი",
};

// ---------------------------
// Utility Functions
// ---------------------------

// Returns all unique classes found in teacher timetables (ignoring "free")
// Sorted naturally (e.g., 1A, 1B, 2A, …, 12A, 12B)
const getUniqueClasses = () => {
  const classSet = new Set();
  teachers.forEach((teacher) => {
    weekdays.forEach((day) => {
      teacher.timetable[day].forEach((lesson) => {
        if (lesson.class && lesson.class.toLowerCase() !== "free") {
          classSet.add(lesson.class);
        }
      });
    });
  });
  const classesArray = Array.from(classSet);
  classesArray.sort((a, b) => {
    const gradeA = parseInt(a, 10);
    const gradeB = parseInt(b, 10);
    if (gradeA === gradeB) {
      const letterA = a.replace(gradeA.toString(), "");
      const letterB = b.replace(gradeB.toString(), "");
      return letterA.localeCompare(letterB);
    }
    return gradeA - gradeB;
  });
  return classesArray;
};

// Returns the original assignment (from data.js) for a given day, class, and lesson period.
const getOriginalAssignmentForPeriod = (day, cls, period) => {
  const assigned = teachers.filter((teacher) =>
    teacher.timetable[day].some(
      (lesson) => lesson.lesson === period && lesson.class === cls
    )
  );
  if (assigned.length > 0) {
    const subject = assigned[0].subject;
    return `${assigned[0].name} (${subject})`;
  }
  return "No Class";
};

// Given day, class, lesson period, and teacherAvailability,
// returns the updated teacher assignment based on availability.
const recalcTeacherForPeriod = (day, cls, period, teacherAvailability) => {
  const assignedTeachers = teachers.filter((teacher) =>
    teacher.timetable[day].some(
      (lesson) => lesson.lesson === period && lesson.class === cls
    )
  );
  if (assignedTeachers.length === 0) {
    return "No Class";
  }
  const subject = assignedTeachers[0].subject;
  const availableAssigned = assignedTeachers.filter((t) => {
    const avail = teacherAvailability[t.id] && teacherAvailability[t.id][day];
    return (
      avail && !avail.absent && period >= avail.from && period <= avail.until
    );
  });
  if (availableAssigned.length > 0) {
    return `${availableAssigned[0].name} (${subject})`;
  }
  // No originally assigned teacher is available; search among all teachers with the same subject.
  let replacementCandidates = teachers.filter((t) => {
    const avail = teacherAvailability[t.id] && teacherAvailability[t.id][day];
    return (
      t.subject === subject &&
      avail &&
      !avail.absent &&
      period >= avail.from &&
      period <= avail.until
    );
  });
  // For grades 6 or higher, exclude beginner teachers.
  const grade = parseInt(cls, 10);
  if (grade >= 6) {
    replacementCandidates = replacementCandidates.filter(
      (t) => !t.isBeginningTeacher
    );
  }
  if (replacementCandidates.length > 0) {
    return `${replacementCandidates[0].name} (${subject})`;
  }
  return `${subject} (No teacher)`;
};

// ---------------------------
// Improved Styling Objects
// ---------------------------
const styles = {
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "20px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    backgroundColor: "#f9f9f9",
  },
  pageTitle: {
    textAlign: "center",
    marginBottom: "20px",
    color: "#333",
  },
  sectionTitle: {
    marginBottom: "15px",
    color: "#444",
  },
  nav: {
    marginBottom: "20px",
    textAlign: "center",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "10px",
  },
  navLink: {
    padding: "10px 20px",
    backgroundColor: "#007bff",
    color: "white",
    textDecoration: "none",
    borderRadius: "4px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
    transition: "transform 0.2s, background-color 0.2s",
    display: "inline-block",
    "&:hover": {
      transform: "translateY(-2px)",
      backgroundColor: "#0069d9",
    },
  },
  secondaryNavLink: {
    backgroundColor: "#6f42c1",
    "&:hover": {
      backgroundColor: "#5e35b1",
    },
  },
  gradeLinkStyle: {
    backgroundColor: "#28a745",
    "&:hover": {
      backgroundColor: "#218838",
    },
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: "20px",
    borderRadius: "4px",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  th: {
    backgroundColor: "#f2f2f2",
    padding: "12px 8px",
    border: "1px solid #ddd",
    fontWeight: "600",
    textAlign: "center",
  },
  td: {
    padding: "10px 8px",
    border: "1px solid #ddd",
    textAlign: "center",
    verticalAlign: "middle",
  },
  selectDay: {
    padding: "8px 12px",
    borderRadius: "4px",
    border: "1px solid #ddd",
    marginLeft: "8px",
  },
  cellUnchanged: {
    backgroundColor: "#d4edda", // Green for unchanged
  },
  cellChanged: {
    backgroundColor: "#fff3cd", // Yellow for changed
  },
  cellNoTeacher: {
    backgroundColor: "#f8d7da", // Red for no teacher
  },
  availabilityControls: {
    fontSize: "0.9em",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  gradeButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center",
    marginTop: "10px",
  },
};

// ---------------------------
// 1. Teacher Availability Manager
// ---------------------------
const TeacherAvailabilityManager = ({
  teacherAvailability,
  setTeacherAvailability,
}) => {
  const handleChange = (teacherId, day, field, value) => {
    setTeacherAvailability((prev) => ({
      ...prev,
      [teacherId]: {
        ...prev[teacherId],
        [day]: {
          ...prev[teacherId][day],
          [field]: value,
        },
      },
    }));
  };

  return (
    <div>
      <h2 style={styles.sectionTitle}>მასწავლებლების ხელმისაწვდომობა</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>მასწავლებელი</th>
            {weekdays.map((day) => (
              <th key={day} style={styles.th}>
                {georgianDays[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teachers.map((teacher) => (
            <tr key={teacher.id}>
              <td style={styles.td}>
                <strong>{teacher.name}</strong> ({teacher.subject})
                {teacher.isBeginningTeacher && (
                  <div style={{ fontSize: "0.8em", color: "#666" }}>
                    (დამწყები)
                  </div>
                )}
              </td>
              {weekdays.map((day) => {
                const avail = teacherAvailability[teacher.id][day];
                return (
                  <td key={day} style={styles.td}>
                    <div style={styles.availabilityControls}>
                      <label>
                        <input
                          type="checkbox"
                          checked={avail.absent}
                          onChange={(e) => {
                            handleChange(
                              teacher.id,
                              day,
                              "absent",
                              e.target.checked
                            );
                          }}
                        />{" "}
                        არ არის
                      </label>
                      {!avail.absent && (
                        <div>
                          <div>
                            დან:{" "}
                            <select
                              value={avail.from}
                              onChange={(e) => {
                                const newFrom = parseInt(e.target.value, 10);
                                const newUntil = Math.max(newFrom, avail.until);
                                handleChange(teacher.id, day, "from", newFrom);
                                handleChange(
                                  teacher.id,
                                  day,
                                  "until",
                                  newUntil
                                );
                              }}
                            >
                              {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                                <option key={num} value={num}>
                                  {num}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            მდე:{" "}
                            <select
                              value={avail.until}
                              onChange={(e) => {
                                const newUntil = parseInt(e.target.value, 10);
                                const newFrom = Math.min(avail.from, newUntil);
                                handleChange(
                                  teacher.id,
                                  day,
                                  "until",
                                  newUntil
                                );
                                handleChange(teacher.id, day, "from", newFrom);
                              }}
                            >
                              {[1, 2, 3, 4, 5, 6, 7]
                                .filter((num) => num >= avail.from)
                                .map((num) => (
                                  <option key={num} value={num}>
                                    {num}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------
// 2. Global Overview (Single Day)
// ---------------------------
const GlobalOverview = ({ teacherAvailability }) => {
  const [selectedDay, setSelectedDay] = useState("Monday");
  const classes = useMemo(() => getUniqueClasses(), []);

  const overview = useMemo(() => {
    const result = {};
    classes.forEach((cls) => {
      result[cls] = [];
      for (let period = 1; period <= 7; period++) {
        const original = getOriginalAssignmentForPeriod(
          selectedDay,
          cls,
          period
        );
        const current = recalcTeacherForPeriod(
          selectedDay,
          cls,
          period,
          teacherAvailability
        );
        result[cls].push({ period, original, current });
      }
    });
    return result;
  }, [classes, selectedDay, teacherAvailability]);

  return (
    <div>
      <h2 style={styles.sectionTitle}>
        გლობალური მიმოხილვა - {georgianDays[selectedDay]}
      </h2>
      <div style={{ marginBottom: "15px" }}>
        <label style={{ fontWeight: "500" }}>აირჩიეთ დღე:</label>
        <select
          value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value)}
          style={styles.selectDay}
        >
          {weekdays.map((day) => (
            <option key={day} value={day}>
              {georgianDays[day]}
            </option>
          ))}
        </select>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>კლასი</th>
            {[...Array(7)].map((_, i) => (
              <th key={i} style={styles.th}>
                სესია {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classes.map((cls) => (
            <tr key={cls}>
              <td style={{ ...styles.td, fontWeight: "bold" }}>{cls}</td>
              {overview[cls].map((cell, i) => {
                const changed = cell.original !== cell.current;
                let cellStyle = { ...styles.td };

                if (changed) {
                  cellStyle = {
                    ...cellStyle,
                    ...(cell.current.includes("No teacher")
                      ? styles.cellNoTeacher
                      : styles.cellChanged),
                  };
                } else {
                  cellStyle = { ...cellStyle, ...styles.cellUnchanged };
                }

                return (
                  <td key={i} style={cellStyle}>
                    <div style={{ marginBottom: "4px" }}>
                      <strong>ორიგინალი:</strong> {cell.original}
                    </div>
                    <div>
                      <strong>მიმდინარე:</strong> {cell.current}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------
// 3. Grade Timetable
// ---------------------------
const GradeTimetable = ({ teacherAvailability }) => {
  const { grade } = useParams();
  const gradeNumber = parseInt(grade, 10);
  const allClasses = useMemo(() => getUniqueClasses(), []);
  const classesForGrade = useMemo(
    () => allClasses.filter((cls) => parseInt(cls, 10) === gradeNumber),
    [allClasses, gradeNumber]
  );

  if (classesForGrade.length === 0) {
    return (
      <div>
        <h2 style={styles.sectionTitle}>კლასი {gradeNumber}</h2>
        <div style={{ textAlign: "center", padding: "20px" }}>
          ამ კლასისთვის მონაცემები არ არის ხელმისაწვდომი.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={styles.sectionTitle}>კლასი {gradeNumber} - განრიგი</h2>

      {weekdays.map((day) => (
        <div key={day} style={{ marginBottom: "30px" }}>
          <h3 style={{ color: "#555", marginBottom: "10px" }}>
            {georgianDays[day]}
          </h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>კლასი</th>
                {[...Array(7)].map((_, i) => (
                  <th key={i} style={styles.th}>
                    სესია {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classesForGrade.map((cls) => (
                <tr key={cls}>
                  <td style={{ ...styles.td, fontWeight: "bold" }}>{cls}</td>
                  {Array.from({ length: 7 }).map((_, i) => {
                    const period = i + 1;
                    const original = getOriginalAssignmentForPeriod(
                      day,
                      cls,
                      period
                    );
                    const current = recalcTeacherForPeriod(
                      day,
                      cls,
                      period,
                      teacherAvailability
                    );
                    const changed = original !== current;

                    let cellStyle = { ...styles.td };
                    if (changed) {
                      cellStyle = {
                        ...cellStyle,
                        ...(current.includes("No teacher")
                          ? styles.cellNoTeacher
                          : styles.cellChanged),
                      };
                    } else if (original !== "No Class") {
                      cellStyle = { ...cellStyle, ...styles.cellUnchanged };
                    }

                    return (
                      <td key={i} style={cellStyle}>
                        {current}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

// ---------------------------
// Navigation Component
// ---------------------------
const Navigation = () => {
  const gradeButtons = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <nav style={styles.nav}>
      <Link to="/availability" style={{ ...styles.navLink }}>
        დამკვირვე ხელმისაწვდომობა
      </Link>
      <Link
        to="/global"
        style={{ ...styles.navLink, ...styles.secondaryNavLink }}
      >
        გლობალური მიმოხილვა
      </Link>
      <div style={styles.gradeButtons}>
        {gradeButtons.map((g) => (
          <Link
            key={g}
            to={`/grade/${g}`}
            style={{ ...styles.navLink, ...styles.gradeLinkStyle }}
          >
            კლასი {g}
          </Link>
        ))}
      </div>
    </nav>
  );
};

// ---------------------------
// Top-Level Component with Routing
// ---------------------------
const SchoolScheduler = () => {
  // Initialize teacherAvailability state using a function to ensure it's only created once
  const [teacherAvailability, setTeacherAvailability] = useState(() => {
    const initialAvailability = {};
    teachers.forEach((teacher) => {
      initialAvailability[teacher.id] = {};
      weekdays.forEach((day) => {
        initialAvailability[teacher.id][day] = {
          absent: false,
          from: 1,
          until: 7,
        };
      });
    });
    return initialAvailability;
  });

  return (
    <Router>
      <div style={styles.container}>
        <h1 style={styles.pageTitle}>სკოლის განრიგი</h1>
        <Navigation />

        <Routes>
          <Route
            path="/availability"
            element={
              <TeacherAvailabilityManager
                teacherAvailability={teacherAvailability}
                setTeacherAvailability={setTeacherAvailability}
              />
            }
          />
          <Route
            path="/global"
            element={
              <GlobalOverview teacherAvailability={teacherAvailability} />
            }
          />
          <Route
            path="/grade/:grade"
            element={
              <GradeTimetable teacherAvailability={teacherAvailability} />
            }
          />
          <Route path="/" element={<Navigate to="/availability" replace />} />
        </Routes>
      </div>
    </Router>
  );
};

export default SchoolScheduler;
