import React, { useState, useMemo } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useParams,
  Navigate,
} from "react-router-dom";
import { teachers } from "./data.js"; // მასწავლებლების მონაცემები

// შაბათის დღების რედაქტირება
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const georgianDays = {
  Monday: "ორშაბათი",
  Tuesday: "სამშაბათი",
  Wednesday: "ოთხშაბათი",
  Thursday: "ხუთშაბათი",
  Friday: "პარასკევი",
};

// ---------------------------
// სასარგებლო ფუნქციები
// ---------------------------

// აბრუნებს ყველა უნიკალურ კლასს, რომლებიც არის მასწავლებლების განრიგში (გავლენას "free"-ზე არ ითვალისწინებს)
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

// აბრუნებს ორიგინალურ ასაინმენტს მოცემულ დღეს, კლასში და სესიაზე
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

// მოცემულ დღეს, კლასში, და სესიაზე - გადახდისას, ახდენს ხელმისაწვდომობის შემოწმებას და აბრუნებს ახალ ასაინმენტს
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
  // თუ არცერთი თავდაპირველი მასწავლებელი ხელმისაწვდომი არ არის, ეძებს შესაბამის საგნის სხვა მასწავლებელს
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

// ---------------
// ახალი დახმარებით ფუნქციები კონფლიქტების გადაჭრისთვის
// ---------------

// ამოღებს მასწავლებლის სახელს ასაინმენტის სტრინგიდან ("სახელი (საგანი)")
const extractTeacherName = (assignment) => {
  const idx = assignment.indexOf(" (");
  if (idx !== -1) return assignment.substring(0, idx);
  return assignment;
};

// შემოწმება, არის თუ არა მასწავლებელი უკვე განრიგში მინიშნებული იმავე სესიაზე
const isTeacherAssignedAtPeriod = (teacherName, period, schedule) => {
  for (let cls in schedule) {
    for (let cell of schedule[cls]) {
      if (cell.finalPeriod === period && cell.assigned !== "No Class") {
        if (extractTeacherName(cell.assigned) === teacherName) {
          return true;
        }
      }
    }
  }
  return false;
};

// ეძებს ახალ, განყოფილ პერიოდის იმავე კლასში, სადაც იგივე მასწავლებელი ხელმისაწვდომია (გადაცემა - swap)
const findAvailablePeriodForCell = (
  day,
  cell,
  teacherAvailability,
  schedule
) => {
  // გამოგვიგზავნის მასწავლებლის სახელს ორიგინალურ ასაინმენტში
  const teacherName = extractTeacherName(cell.original);
  for (let newPeriod = 1; newPeriod <= 7; newPeriod++) {
    if (newPeriod === cell.period) continue;
    // გამოვთვალოთ თუ მასწავლებელი ხელმისაწვდომია ამ ახალ დროში
    const teacherObj = teachers.find((t) => t.name === teacherName);
    if (!teacherObj) continue;
    const avail =
      teacherAvailability[teacherObj.id] &&
      teacherAvailability[teacherObj.id][day];
    if (
      avail &&
      !avail.absent &&
      newPeriod >= avail.from &&
      newPeriod <= avail.until
    ) {
      // თუ ამ პერიოდში მასწავლებელი ჯერ არ არის განკუთვნილი სხვა კლასში, გადაცემა შეიძლება
      if (!isTeacherAssignedAtPeriod(teacherName, newPeriod, schedule)) {
        return newPeriod;
      }
    }
  }
  return null;
};

// ეძებს სათამაშო ასაინმენტს სხვა მასწავლებლით იმავე საგნზე (თუ გადაცემა არ შესაძლებელია)
const findReplacementTeacher = (
  day,
  period,
  cell,
  teacherAvailability,
  schedule
) => {
  const subjectMatch = cell.original.match(/\(([^)]+)\)/);
  const subject = subjectMatch ? subjectMatch[1] : "";
  let candidates = teachers.filter((t) => {
    const avail = teacherAvailability[t.id] && teacherAvailability[t.id][day];
    if (!avail || avail.absent) return false;
    if (period < avail.from || period > avail.until) return false;
    if (t.subject !== subject) return false;
    if (isTeacherAssignedAtPeriod(t.name, period, schedule)) return false;
    // კლასების 6+ დონეზე არ გამოიყენოს დამწყები მასწავლებლები
    const grade = parseInt(cell.cls, 10);
    if (grade >= 6 && t.isBeginningTeacher) return false;
    return true;
  });
  return candidates.length > 0 ? candidates[0] : null;
};

// მთავარი ფუნქცია, რომელიც აგენერირებს საბოლოო განრიგს მოცემულ დღეს და აწარმოებს კონფლიქტების გადაჭრას
const computeScheduleForDay = (day, teacherAvailability, teacherSubHours) => {
  const schedule = {};
  const classes = getUniqueClasses();
  // ინიცირება: ყოველი კლასი და თითოეული სესია
  classes.forEach((cls) => {
    schedule[cls] = [];
    for (let period = 1; period <= 7; period++) {
      const original = getOriginalAssignmentForPeriod(day, cls, period);
      if (original === "No Class") {
        schedule[cls].push({
          cls,
          period,
          finalPeriod: period,
          original: "No Class",
          assigned: "No Class",
          moved: false,
          reassigned: false,
          hoursChanged: false,
        });
      } else {
        const assigned = recalcTeacherForPeriod(
          day,
          cls,
          period,
          teacherAvailability
        );
        schedule[cls].push({
          cls,
          period,
          finalPeriod: period,
          original,
          assigned,
          moved: false,
          reassigned: original !== assigned,
          hoursChanged: false,
        });
      }
    }
  });

  // მეპარამეტრეა: თითოეული სესიაზე თითოეული მასწავლებლის მიერ ასული ნაგულისხმევი განრიგი
  const assignmentsByPeriod = {};
  classes.forEach((cls) => {
    schedule[cls].forEach((cell) => {
      if (cell.assigned !== "No Class") {
        const teacherName = extractTeacherName(cell.assigned);
        if (!assignmentsByPeriod[cell.finalPeriod]) {
          assignmentsByPeriod[cell.finalPeriod] = {};
        }
        if (!assignmentsByPeriod[cell.finalPeriod][teacherName]) {
          assignmentsByPeriod[cell.finalPeriod][teacherName] = [];
        }
        assignmentsByPeriod[cell.finalPeriod][teacherName].push({ cls, cell });
      }
    });
  });

  // გადაჭრის ლოგიკა: თუ რომელიმე მასწავლებელს იმავე სესიაზე აქვს მეტს ერთხელ დანიშნულება
  for (let period in assignmentsByPeriod) {
    for (let teacherName in assignmentsByPeriod[period]) {
      const assignments = assignmentsByPeriod[period][teacherName];
      if (assignments.length > 1) {
        // პირველი დანიშნა დარჩეს, დანარჩენი უნდა გადანაწილდეს
        assignments.sort(
          (a, b) =>
            (a.cell.original === a.cell.assigned ? 0 : 1) -
            (b.cell.original === b.cell.assigned ? 0 : 1)
        );
        for (let i = 1; i < assignments.length; i++) {
          const { cls, cell } = assignments[i];
          // პირველ რიგში, ცდება "გადაცემა" (swap) იმავე მასწავლებლისთვის, სხვა დროს, სადაც ის ხელმისაწვდომია
          const swapPeriod = findAvailablePeriodForCell(
            day,
            cell,
            teacherAvailability,
            schedule
          );
          if (swapPeriod) {
            cell.finalPeriod = swapPeriod;
            cell.moved = true;
            // მასწავლებელი რჩება იგივე, რადგანაც ეს არის კლასი გადაცემა
            cell.assigned = cell.original;
          } else {
            // თუ გადაცემა შეუძლებელია, ცდება შეიცვალოს მასწავლებელი სხვა კანდიდატით
            const replacement = findReplacementTeacher(
              day,
              parseInt(period, 10),
              cell,
              teacherAvailability,
              schedule
            );
            if (replacement) {
              cell.assigned = `${replacement.name} (${replacement.subject})`;
              cell.reassigned = true;
              cell.hoursChanged = true;
              teacherSubHours[replacement.id] =
                (teacherSubHours[replacement.id] || 0) + 1;
            } else {
              // საბოლოოდ, თუ არაფერი არ მუშაობს, კლასში "არ არის მასწავლებელი"
              cell.assigned = "No teacher";
              cell.reassigned = true;
            }
          }
        }
      }
    }
  }
  return schedule;
};

// ---------------------------
// სტილის ობიექტი
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
  },
  secondaryNavLink: {
    backgroundColor: "#6f42c1",
  },
  gradeLinkStyle: {
    backgroundColor: "#28a745",
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
  // ფერით დაკოდები:
  cellUnchanged: { backgroundColor: "#d4edda" }, // მწვანე
  cellChanged: { backgroundColor: "#fff3cd" }, // ყვითელი
  cellNoTeacher: { backgroundColor: "#f8d7da" }, // წითელი
  cellMoved: { backgroundColor: "#cce5ff" }, // ლურჯი
  cellReassigned: { backgroundColor: "#ffeeba" }, // ფორთოხალი
  cellHoursChanged: { backgroundColor: "#e2d6f2" }, // მარცხფერი
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
// 1. მასწავლებლების ხელმისაწვდომობის მენეჯერი (ძიების ველი და საათების ჩვენება)
// ---------------------------
const TeacherAvailabilityManager = ({
  teacherAvailability,
  setTeacherAvailability,
  teacherSubHours,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  // ფილტრი, იმას შესარჩევად, რომელმა მასწავლებლებს შეესაბამება ძიების ტერმინი
  const filteredTeachers = teachers.filter((teacher) =>
    teacher.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      <div style={{ marginBottom: "10px", textAlign: "center" }}>
        <input
          type="text"
          placeholder="ძიება: მასწავლებელი"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "8px 12px",
            width: "50%",
            borderRadius: "4px",
            border: "1px solid #ddd",
          }}
        />
      </div>
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
          {filteredTeachers.map((teacher) => (
            <tr key={teacher.id}>
              <td style={styles.td}>
                <strong>{teacher.name}</strong> ({teacher.subject}){" "}
                <span style={{ fontSize: "0.9em", color: "#555" }}>
                  [ჯამური საათები:{" "}
                  {teacher.teachingHours + (teacherSubHours[teacher.id] || 0)}]
                </span>
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
                          onChange={(e) =>
                            handleChange(
                              teacher.id,
                              day,
                              "absent",
                              e.target.checked
                            )
                          }
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
// 2. გლობალური მიმოხილვა (ერთი დღე) – განახლებული, მუშაობს computeScheduleForDay-ის საფუძველზე
// ---------------------------
const GlobalOverview = ({
  teacherAvailability,
  teacherSubHours,
  setTeacherSubHours,
}) => {
  const [selectedDay, setSelectedDay] = useState("Monday");
  const schedule = useMemo(
    () =>
      computeScheduleForDay(selectedDay, teacherAvailability, teacherSubHours),
    [selectedDay, teacherAvailability, teacherSubHours]
  );
  const classes = getUniqueClasses();

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
                გაკვეთილი {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classes.map((cls) => (
            <tr key={cls}>
              <td style={{ ...styles.td, fontWeight: "bold" }}>{cls}</td>
              {schedule[cls].map((cell, i) => {
                let cellStyle = { ...styles.td };
                if (cell.assigned === "No teacher") {
                  cellStyle = { ...cellStyle, ...styles.cellNoTeacher };
                } else if (cell.moved) {
                  cellStyle = { ...cellStyle, ...styles.cellMoved };
                } else if (cell.reassigned) {
                  cellStyle = { ...cellStyle, ...styles.cellReassigned };
                } else if (cell.hoursChanged) {
                  cellStyle = { ...cellStyle, ...styles.cellHoursChanged };
                } else {
                  cellStyle = { ...cellStyle, ...styles.cellUnchanged };
                }
                return (
                  <td key={i} style={cellStyle}>
                    <div>
                      <strong>ასწავლის:</strong> {cell.assigned}
                    </div>
                    {cell.moved && (
                      <div>
                        გადაცემული: {cell.period}-დან {cell.finalPeriod}-მდე
                      </div>
                    )}
                    {cell.reassigned && <div>სასწავლებელი შეიცვალა</div>}
                    {cell.hoursChanged && <div>დამატებული საათები</div>}
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
// 3. კლასის განრიგი – განახლებული, monday-ს განრიგით (გთხოვთ, ახლოუდღეთ საჭიროებისამებრ)
// ---------------------------
const GradeTimetable = ({
  teacherAvailability,
  teacherSubHours,
  setTeacherSubHours,
}) => {
  const { grade } = useParams();
  const gradeNumber = parseInt(grade, 10);
  const allClasses = getUniqueClasses();
  const classesForGrade = allClasses.filter(
    (cls) => parseInt(cls, 10) === gradeNumber
  );
  const day = "Monday";
  const schedule = useMemo(
    () => computeScheduleForDay(day, teacherAvailability, teacherSubHours),
    [day, teacherAvailability, teacherSubHours]
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
      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
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
                    გაკვეთილი {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classesForGrade.map((cls) => (
                <tr key={cls}>
                  <td style={{ ...styles.td, fontWeight: "bold" }}>{cls}</td>
                  {schedule[cls].map((cell, i) => {
                    let cellStyle = { ...styles.td };
                    if (cell.assigned === "No teacher") {
                      cellStyle = { ...cellStyle, ...styles.cellNoTeacher };
                    } else if (cell.moved) {
                      cellStyle = { ...cellStyle, ...styles.cellMoved };
                    } else if (cell.reassigned) {
                      cellStyle = { ...cellStyle, ...styles.cellReassigned };
                    } else if (cell.hoursChanged) {
                      cellStyle = { ...cellStyle, ...styles.cellHoursChanged };
                    } else {
                      cellStyle = { ...cellStyle, ...styles.cellUnchanged };
                    }
                    return (
                      <td key={i} style={cellStyle}>
                        {cell.assigned}
                        {cell.moved && (
                          <div style={{ fontSize: "0.8em" }}>
                            გადაცემა: {cell.period}-დან {cell.finalPeriod}-მდე
                          </div>
                        )}
                        {cell.reassigned && (
                          <div style={{ fontSize: "0.8em" }}>შეცვლა</div>
                        )}
                        {cell.hoursChanged && (
                          <div style={{ fontSize: "0.8em" }}>
                            დამატებული საათები
                          </div>
                        )}
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
// ნავიგაციის კომპონენტი
// ---------------------------
const Navigation = () => {
  const gradeButtons = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <nav style={styles.nav}>
      <Link to="/availability" style={styles.navLink}>
        მასწავლებლები
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
// მთავარ კომპონენტში, როუტინგი და სტატუსის ინიციალიზაცია
// ---------------------------
const SchoolScheduler = () => {
  const [teacherAvailability, setTeacherAvailability] = useState(() => {
    const initial = {};
    teachers.forEach((teacher) => {
      initial[teacher.id] = {};
      weekdays.forEach((day) => {
        initial[teacher.id][day] = { absent: false, from: 1, until: 7 };
      });
    });
    return initial;
  });

  const [teacherSubHours, setTeacherSubHours] = useState(() => {
    const initial = {};
    teachers.forEach((teacher) => {
      initial[teacher.id] = 0;
    });
    return initial;
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
                teacherSubHours={teacherSubHours}
              />
            }
          />
          <Route
            path="/global"
            element={
              <GlobalOverview
                teacherAvailability={teacherAvailability}
                teacherSubHours={teacherSubHours}
                setTeacherSubHours={setTeacherSubHours}
              />
            }
          />
          <Route
            path="/grade/:grade"
            element={
              <GradeTimetable
                teacherAvailability={teacherAvailability}
                teacherSubHours={teacherSubHours}
                setTeacherSubHours={setTeacherSubHours}
              />
            }
          />
          <Route path="/" element={<Navigate to="/availability" replace />} />
        </Routes>
      </div>
    </Router>
  );
};

export default SchoolScheduler;
