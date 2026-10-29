import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { X } from 'lucide-react';

export default function ActionHub({
  selectedClass,
  setSelectedClass,
  selectedSection,
  setSelectedSection,
  user
}) {
  const [availableClasses, setAvailableClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [teacherProfile, setTeacherProfile] = useState(null);
  
  // Modal states
  const [mobileNumber, setMobileNumber] = useState('');
  const [inputTeacherName, setInputTeacherName] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [reportedStudents, setReportedStudents] = useState({});

  // Fetch teacher profile & auto-fill teacher name & mobile number
  useEffect(() => {
    if (user?.uid) {
      getDoc(doc(db, 'teachers', user.uid)).then(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTeacherProfile(data);
          if (data.mobile) setMobileNumber(data.mobile);
          const computedName = data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || user.email || '';
          if (computedName) setInputTeacherName(computedName);
        }
      }).catch(err => console.error("Error fetching teacher profile", err));
    }
  }, [user]);

  // Live classes from Firestore
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

  // Live student roster
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
      console.error("Students snapshot error:", err);
    });

    return () => unsubscribe();
  }, [selectedClass, selectedSection]);

  // Consolidated alert monitoring listener per student doc ID
  useEffect(() => {
    if (!user || students.length === 0) {
      setReportedStudents({});
      return;
    }
    
    const unsubs = students.map(student => {
      const alertsRef = collection(db, 'students', student.id, 'communication_alerts');
      return onSnapshot(alertsRef, (snap) => {
        const teacherIdentifier = teacherProfile?.displayName || teacherProfile?.name || user?.email || 'Unknown Teacher';
        const report = snap.docs.find(docSnap => {
          const data = docSnap.data();
          return data.teacher_uid === user.uid || data.teacherName === teacherIdentifier;
        });

        setReportedStudents(prev => {
          const next = { ...prev };
          if (report) {
            next[student.id] = report.id;
          } else {
            delete next[student.id];
          }
          return next;
        });
      }, (err) => console.error("Error loading alerts:", err));
    });

    return () => unsubs.forEach(u => u());
  }, [students, user, teacherProfile]);

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!selectedStudent || !mobileNumber || !issueDescription || !inputTeacherName) return;

    setSubmitting(true);
    try {
      const alertsRef = collection(db, 'students', selectedStudent.id, 'communication_alerts');
      await addDoc(alertsRef, {
        teacherName: inputTeacherName,
        teacher_uid: user?.uid || null,
        teacherMobile: mobileNumber,
        issueDetails: issueDescription,
        timestamp: serverTimestamp(),
      });
      
      setSuccessMsg('Report submitted successfully.');
      setTimeout(() => {
        setSuccessMsg('');
        setSelectedStudent(null);
        setIssueDescription('');
      }, 1500);
    } catch (err) {
      console.error("Error submitting report", err);
      alert("Failed to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReport = async (studentId, reportId) => {
    try {
      setReportedStudents(prev => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      await deleteDoc(doc(db, 'students', studentId, 'communication_alerts', reportId));
    } catch (err) {
      console.error("Error deleting report", err);
      alert("Failed to undo report. Please try again.");
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
        <h2 className="selection-title">Action Hub - Select Class</h2>
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

  // ── Stage 3: Student Roster for Action Hub ────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--emerald-400)' }}>
          {selectedClass} ({selectedSection})
        </h2>
        <button
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}
          onClick={() => { setSelectedClass(''); setSelectedSection(''); }}
        >
          Change Class
        </button>
      </div>
      
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Select a student below to report an unreachable parent or communication issue.
      </p>
      
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

      {students.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
          Loading roster or no students found...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
          {students
            .filter(student => (student.name || `${student.firstName || ''} ${student.lastName || ''}`).toLowerCase().includes(searchQuery.toLowerCase()))
            .map(student => {
              const reportId = reportedStudents[student.id];
              return (
                <div 
                  key={student.id} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '0.75rem', 
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid rgba(255,255,255,0.08)', 
                    borderRadius: '0.5rem',
                    cursor: reportId ? 'default' : 'pointer'
                  }}
                  onClick={() => {
                    if (!reportId) setSelectedStudent(student);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{getEmoji(student.gender)}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: '600' }}>
                        {student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown'}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        ID: {student.satsId || student.id}
                      </span>
                    </div>
                  </div>
                  {reportId ? (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteReport(student.id, reportId);
                      }}
                      style={{ 
                        padding: '0.4rem 0.8rem', 
                        fontSize: '0.75rem',
                        background: 'transparent',
                        color: '#f59e0b',
                        border: '1px solid #f59e0b',
                        borderRadius: '0.5rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      🚨 Reported (Tap to Undo)
                    </button>
                  ) : (
                    <button 
                      className="btn-primary" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStudent(student);
                      }}
                    >
                      Report
                    </button>
                  )}
                </div>
              );
          })}
        </div>
      )}

      {/* Unreachable Reporting Form Modal */}
      {selectedStudent && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1a1d24',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '1rem',
            width: '100%',
            maxWidth: '400px',
            padding: '1.5rem',
            position: 'relative'
          }}>
            <button 
              onClick={() => { setSelectedStudent(null); setSuccessMsg(''); }}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <span style={{ marginRight: '0.3rem' }}>← Back</span><X size={20} />
            </button>
            
            <h3 style={{ color: 'var(--emerald-400)', marginBottom: '0.5rem', fontSize: '1.25rem' }}>Recovery Alert</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Reporting communication issue for <strong>{selectedStudent.name || `${selectedStudent.firstName || ''} ${selectedStudent.lastName || ''}`.trim() || 'Unknown'}</strong>.
            </p>

            {successMsg ? (
              <div style={{ padding: '1rem', background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '0.5rem', color: 'var(--emerald-400)', textAlign: 'center', marginBottom: '1rem' }}>
                {successMsg}
              </div>
            ) : (
              <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Teacher Name / Display Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your name (e.g., Gagan)"
                    value={inputTeacherName}
                    onChange={(e) => setInputTeacherName(e.target.value)}
                    style={{
                      width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem',
                      color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Current Callback Mobile Number
                  </label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    style={{
                      width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem',
                      color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Detailed Issue Description / Important Information
                  </label>
                  <textarea
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    rows={4}
                    style={{
                      width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem',
                      color: 'var(--text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box'
                    }}
                    required
                    placeholder="E.g., Parent number is unreachable..."
                  />
                </div>
                
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Alert'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
