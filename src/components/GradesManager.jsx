import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Search, ChevronDown, ChevronUp, Award } from 'lucide-react';

export default function GradesManager({
  selectedClass,
  setSelectedClass,
  selectedSection,
  setSelectedSection
}) {
  const [availableClasses, setAvailableClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);

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
      setExpandedId(null);
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
      console.error("Grades snapshot error:", err);
    });

    return () => unsubscribe();
  }, [selectedClass, selectedSection]);

  const filteredStudents = useMemo(() => {
    if (!searchQuery) return students;
    const lowerQ = searchQuery.toLowerCase();
    return students.filter(s => {
      const fullName = (s.name || `${s.firstName || ''} ${s.lastName || ''}`).toLowerCase();
      return fullName.includes(lowerQ) || (s.satsId && s.satsId.toLowerCase().includes(lowerQ));
    });
  }, [students, searchQuery]);

  // Compute student percentage summary
  const getStudentMetrics = (marks) => {
    if (!marks || Object.keys(marks).length === 0) return null;
    let totalObtained = 0;
    let totalMax = 0;

    Object.values(marks).forEach(exam => {
      if (exam.subjects) {
        Object.values(exam.subjects).forEach(sub => {
          if (typeof sub.initialScore === 'number') {
            totalObtained += sub.initialScore;
            totalMax += sub.maxMarks || 100;
          }
        });
      }
    });

    if (totalMax === 0) return null;
    const percentage = Math.round((totalObtained / totalMax) * 100);
    return { percentage, totalObtained, totalMax };
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

  // ── Directory view with search ────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--emerald-400)' }}>
          {selectedClass} — {selectedSection}
        </div>
        <button
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}
          onClick={() => { setSelectedClass(''); setSelectedSection(''); }}
        >
          Change
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '1rem', color: 'var(--text-secondary)' }} />
        <input
          type="text"
          className="directory-search"
          placeholder="Search students..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ paddingLeft: '2.5rem' }}
        />
      </div>

      <div className="directory-grid">
        {filteredStudents.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
            {students.length === 0 ? 'Loading roster...' : 'No students match your search.'}
          </div>
        ) : (
          filteredStudents.map((student) => {
            const isExpanded = expandedId === student.id;
            const marks = student.marks || {};
            const examIds = Object.keys(marks);
            const metrics = getStudentMetrics(marks);

            const displayName = student.name
              || `${student.firstName || ''} ${student.lastName || ''}`.trim()
              || 'Unknown';

            return (
              <div key={student.id} className="directory-tile">
                <div className="tile-header" onClick={() => setExpandedId(isExpanded ? null : student.id)}>
                  <div>
                    <div className="tile-name">{displayName}</div>
                    <div className="tile-id">ID: {student.satsId || student.id}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {metrics && (
                      <span style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: 'bold', 
                        color: metrics.percentage >= 75 ? 'var(--emerald-400)' : metrics.percentage >= 50 ? '#f59e0b' : '#ef4444',
                        background: 'rgba(255,255,255,0.05)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.4rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <Award size={14} /> {metrics.percentage}%
                      </span>
                    )}
                    {isExpanded
                      ? <ChevronUp size={20} color="var(--emerald-400)" />
                      : <ChevronDown size={20} color="var(--text-secondary)" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="academic-panel">
                    {examIds.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0.75rem 0' }}>
                        No exam records found.
                      </p>
                    ) : (
                      examIds.map(examId => {
                        const examData = marks[examId] || {};
                        const subjects = Object.keys(examData.subjects || {});

                        return (
                          <div key={examId} style={{ marginTop: '0.75rem' }}>
                            <div style={{
                              display: 'inline-block',
                              background: 'rgba(52, 211, 153, 0.1)',
                              border: '1px solid rgba(52, 211, 153, 0.3)',
                              borderRadius: '0.5rem',
                              padding: '0.2rem 0.75rem',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              color: 'var(--emerald-400)',
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              marginBottom: '0.75rem'
                            }}>
                              {examId}
                            </div>

                            {subjects.length === 0 ? (
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No subjects recorded.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {subjects.map(sub => {
                                  const subData = examData.subjects[sub] || {};
                                  const score = subData.initialScore ?? '—';
                                  const maxMarks = subData.maxMarks || 100;
                                  const minPassing = subData.minPassing || 35;
                                  const isPassing = typeof score === 'number' && score >= minPassing;

                                  return (
                                    <div key={sub} style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '0.6rem 0.75rem',
                                      background: 'rgba(255,255,255,0.03)',
                                      borderRadius: '0.5rem',
                                      border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                      <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                        {sub}
                                      </span>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{
                                          fontSize: '1rem',
                                          fontWeight: '800',
                                          color: typeof score === 'number'
                                            ? (isPassing ? 'var(--emerald-400)' : '#ef4444')
                                            : 'var(--text-secondary)'
                                        }}>
                                          {score}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                          / {maxMarks}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
