import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../firebase';

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function AttendanceManager({
  selectedClass,
  setSelectedClass,
  selectedSection,
  setSelectedSection,
  currentIndex,
  setCurrentIndex
}) {
  const [availableClasses, setAvailableClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load selection-specific state on mount/change
  useEffect(() => {
    if (selectedClass && selectedSection) {
      const todayStr = getTodayString();
      const savedDraft = localStorage.getItem(`attendance_draft_${selectedClass}_${selectedSection}`);
      setAttendanceDraft(savedDraft ? JSON.parse(savedDraft) : {});
      setIsSubmitted(localStorage.getItem(`attendance_submitted_${selectedClass}_${selectedSection}_${todayStr}`) === 'true');
      
      const savedIndex = localStorage.getItem(`attendance_index_${selectedClass}_${selectedSection}`);
      if (savedIndex !== null) {
        setCurrentIndex(parseInt(savedIndex, 10) || 0);
      } else {
        setCurrentIndex(0);
      }
    } else {
      setAttendanceDraft({});
      setIsSubmitted(false);
      setCurrentIndex(0);
    }
  }, [selectedClass, selectedSection, setCurrentIndex]);

  // ── Live classes from Firestore /classes collection ───────────────────────
  useEffect(() => {
    const q = query(collection(db, 'classes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status !== 'deleted') {
          list.push({ id: docSnap.id, name: data.name || docSnap.id, order: data.order || 99 });
        }
      });
      list.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, undefined, { numeric: true }));
      setAvailableClasses(list);
    }, (err) => {
      console.error("Classes listener error:", err);
    });
    return () => unsubscribe();
  }, []);

  // ── Live student roster ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedClass || !selectedSection) {
      setStudents([]);
      return;
    }

    const q = query(
      collection(db, 'students'),
      where('class', '==', selectedClass),
      where('section', '==', selectedSection),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const studs = [];
      snapshot.forEach((docSnap) => {
        studs.push({ id: docSnap.id, ...docSnap.data() });
      });
      studs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStudents(studs);
    }, (err) => {
      console.error("Attendance snapshot error:", err);
    });

    return () => unsubscribe();
  }, [selectedClass, selectedSection]);

  // Consolidated attendance status listener (eliminating N+1 snapshot listeners)
  useEffect(() => {
    if (isSubmitted && students.length > 0 && selectedClass && selectedSection) {
      const todayStr = getTodayString();
      const unsubs = students.map(student => {
        const attDocRef = doc(db, 'students', student.id, 'attendance', todayStr);
        return onSnapshot(attDocRef, (snap) => {
          if (snap.exists()) {
            const dbStatus = (snap.data().status || 'ABSENT').toUpperCase();
            setAttendanceDraft(prev => ({
              ...prev,
              [student.id]: dbStatus
            }));
          }
        }, (err) => console.error("Error loading submitted status:", err));
      });
      return () => unsubs.forEach(u => u());
    }
  }, [isSubmitted, students, selectedClass, selectedSection]);

  const handleMarkDraft = (studentId, status) => {
    setAttendanceDraft(prev => {
      const next = {
        ...prev,
        [studentId]: status.toUpperCase()
      };
      if (selectedClass && selectedSection) {
        localStorage.setItem(`attendance_draft_${selectedClass}_${selectedSection}`, JSON.stringify(next));
      }
      return next;
    });
    
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    if (selectedClass && selectedSection) {
      localStorage.setItem(`attendance_index_${selectedClass}_${selectedSection}`, nextIndex);
    }
  };

  const handleFinalSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const todayStr = getTodayString();
    
    try {
      // Chunk batch operations (max 400 per writeBatch)
      const chunkSize = 200; // 2 operations per student doc (log + student update)
      for (let i = 0; i < students.length; i += chunkSize) {
        const chunk = students.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        
        chunk.forEach(student => {
          const status = (attendanceDraft[student.id] || 'ABSENT').toUpperCase();
          const studentRef = doc(db, 'students', student.id);
          const logRef = doc(db, 'students', student.id, 'attendance', todayStr);
          
          batch.set(logRef, {
            date: todayStr,
            status: status.toLowerCase(),
            class: selectedClass,
            section: selectedSection,
            markedBy: 'teacher',
            timestamp: new Date()
          }, { merge: true });
          
          if (!isSubmitted) {
            if (status === 'PRESENT') {
              batch.update(studentRef, { 
                daysPresent: increment(1),
                'attendance.daysPresent': increment(1)
              });
            } else {
              batch.update(studentRef, { 
                daysAbsent: increment(1),
                'attendance.daysAbsent': increment(1)
              });
            }
          }
        });
        
        await batch.commit();
      }
      
      localStorage.setItem(`attendance_submitted_${selectedClass}_${selectedSection}_${todayStr}`, 'true');
      setIsSubmitted(true);
    } catch (err) {
      console.error("Batch registry write failed:", err);
      alert("Failed to submit registry record. Check network connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const getEmoji = (gender) => {
    if (gender === 'Female') return '👧';
    return '👦';
  };

  // ── Stage 1: Class selection ──────────────────────────────────────────────
  if (!selectedClass) {
    return (
      <div className="selection-container">
        <h2 className="selection-title">Select Class</h2>
        {availableClasses.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '1rem' }}>
            Loading classes...
          </p>
        ) : (
          <div className="selection-grid">
            {availableClasses.map(cls => (
              <button key={cls.id} className="selection-btn" onClick={() => setSelectedClass(cls.name)}>
                {cls.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Stage 2: Section selection ────────────────────────────────────────────
  if (!selectedSection) {
    return (
      <div className="selection-container">
        <h2 className="selection-title">Select Section</h2>
        <div className="selection-grid">
          {['Section A', 'Section B', 'Section C', 'Section D'].map(sec => (
            <button key={sec} className="selection-btn" onClick={() => setSelectedSection(sec)}>
              {sec}
            </button>
          ))}
        </div>
        <button
          style={{ marginTop: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', textDecoration: 'underline', cursor: 'pointer' }}
          onClick={() => setSelectedClass('')}
        >
          Back to Classes
        </button>
      </div>
    );
  }

  // ── Finalized Submission Lockdown View ────────────────────────────────────
  if (isSubmitted) {
    return (
      <div className="swipe-container" style={{ textAlign: 'center' }}>
        <div style={{ margin: '1.5rem auto', width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(52, 211, 153, 0.1)', border: '2px solid var(--emerald-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2rem', color: 'var(--emerald-400)', fontWeight: 'bold' }}>✓</span>
        </div>
        <h2 style={{ fontSize: '1.75rem', color: 'var(--emerald-400)', marginBottom: '0.5rem' }}>Registry Locked</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Attendance for <strong>{selectedClass} ({selectedSection})</strong> has been successfully submitted and finalized in the school registry.
        </p>

        <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '1rem', marginBottom: '1.5rem', maxHeight: '250px', overflowY: 'auto' }}>
          {students.map(s => {
            const status = attendanceDraft[s.id] || 'ABSENT';
            return (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: '500' }}>
                  {s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown'}
                </span>
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 'bold', 
                  padding: '0.2rem 0.5rem', 
                  borderRadius: '0.5rem', 
                  color: status === 'PRESENT' ? 'var(--emerald-400)' : '#ef4444',
                  background: status === 'PRESENT' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: status === 'PRESENT' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  marginLeft: 'auto'
                }}>
                  {status}
                </span>
              </div>
            );
          })}
        </div>

        <button
          className="btn-primary"
          style={{ maxWidth: '200px', margin: '0 auto' }}
          onClick={() => { 
            setSelectedClass(''); 
            setSelectedSection(''); 
            setCurrentIndex(0); 
          }}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // ── Loading / empty state ─────────────────────────────────────────────────
  if (students.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
        Loading roster or no students found...
        <br /><br />
        <button
          style={{ background: 'transparent', border: 'none', color: 'var(--emerald-400)', textDecoration: 'underline', cursor: 'pointer' }}
          onClick={() => { setSelectedClass(''); setSelectedSection(''); }}
        >
          Reset Selection
        </button>
      </div>
    );
  }

  // ── Completion / Review Board Screen ──────────────────────────────────────
  if (currentIndex >= students.length) {
    const presentCount = students.reduce((acc, s) => {
      const status = attendanceDraft[s.id] || 'ABSENT';
      return acc + (status === 'PRESENT' ? 1 : 0);
    }, 0);

    const absentCount = students.length - presentCount;

    const filteredStudents = students.filter(s => {
      const name = (s.name || `${s.firstName || ''} ${s.lastName || ''}`).toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    });

    return (
      <div className="swipe-container">
        <h2 style={{ fontSize: '1.5rem', color: 'var(--emerald-400)', marginBottom: '0.5rem', textAlign: 'center' }}>Attendance Review Board</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem', textAlign: 'center' }}>
          Review the list below. Tap any badge to correct errors before final submit.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', width: '100%' }}>
          <div style={{ flex: 1, padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.15)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Present</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--emerald-400)', marginTop: '0.1rem' }}>{presentCount}</div>
          </div>
          <div style={{ flex: 1, padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Absent</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ef4444', marginTop: '0.1rem' }}>{absentCount}</div>
          </div>
        </div>

        <div style={{ marginBottom: '1rem', width: '100%' }}>
          <input
            type="text"
            className="directory-search"
            placeholder="Search student by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '0.6rem 0.85rem', 
              background: 'rgba(255,255,255,0.03)', 
              border: '1px solid rgba(255,255,255,0.08)', 
              borderRadius: '0.5rem', 
              color: 'var(--text-primary)', 
              fontSize: '0.85rem',
              outline: 'none', 
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {filteredStudents.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '2rem 0', textAlign: 'center' }}>
              No students match "{searchQuery}"
            </p>
          ) : (
            filteredStudents.map(s => {
              const status = attendanceDraft[s.id] || 'ABSENT';
              return (
                <div 
                  key={s.id} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '0.6rem 0.75rem', 
                    background: 'rgba(255,255,255,0.02)', 
                    border: '1px solid rgba(255,255,255,0.05)', 
                    borderRadius: '0.5rem' 
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: '600' }}>
                      {s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                      ID: {s.satsId || s.id}
                    </span>
                  </div>
                  
                  <button
                    style={{
                      marginLeft: 'auto',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      color: status === 'PRESENT' ? 'var(--emerald-400)' : '#ef4444',
                      background: status === 'PRESENT' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      border: status === 'PRESENT' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                    onClick={() => {
                      const nextStatus = status === 'PRESENT' ? 'ABSENT' : 'PRESENT';
                      setAttendanceDraft(prev => {
                        const next = {
                          ...prev,
                          [s.id]: nextStatus
                        };
                        if (selectedClass && selectedSection) {
                          localStorage.setItem(`attendance_draft_${selectedClass}_${selectedSection}`, JSON.stringify(next));
                        }
                        return next;
                      });
                    }}
                  >
                    {status}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={handleFinalSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Final Submit to School Registry'}
          </button>
          
          <button
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text-secondary)', 
              textDecoration: 'underline', 
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
            onClick={() => { 
              setCurrentIndex(0); 
              if (selectedClass && selectedSection) {
                localStorage.setItem(`attendance_index_${selectedClass}_${selectedSection}`, 0);
              }
            }}
          >
            Restart Swipe Card Board
          </button>
        </div>
      </div>
    );
  }

  // ── Active swipe card ─────────────────────────────────────────────────────
  const student = students[currentIndex];
  if (!student) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
        Loading student card...
      </div>
    );
  }

  return (
    <div className="swipe-container">
      <div className="swipe-card">
        <div className="swipe-content">
          <div className="emoji-avatar">{getEmoji(student.gender)}</div>
          <div className="swipe-name">
            {student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown'}
          </div>
          <div className="swipe-meta">{selectedClass} • {selectedSection}</div>
          <div className="swipe-meta" style={{ marginTop: '0.25rem', fontSize: '0.8rem', opacity: 0.7 }}>
            ID: {student.satsId || student.id}
          </div>
        </div>
        <div className="swipe-actions">
          <button className="action-btn absent" onClick={() => handleMarkDraft(student.id, 'ABSENT')}>
            ABSENT
          </button>
          <button className="action-btn present" onClick={() => handleMarkDraft(student.id, 'PRESENT')}>
            PRESENT
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Student {currentIndex + 1} of {students.length}
      </div>
      
      <button 
        style={{ marginTop: '1rem', background: 'transparent', border: 'none', color: 'var(--emerald-400)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
        onClick={() => setCurrentIndex(students.length)}
      >
        Skip to Review Board
      </button>
      
      <button 
        style={{ marginTop: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
        onClick={() => { setSelectedClass(''); setSelectedSection(''); }}
      >
        ← Change Class / Section
      </button>
    </div>
  );
}
