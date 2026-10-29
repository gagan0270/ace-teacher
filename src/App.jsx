import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { LogOut, GraduationCap, Users, Activity, ArrowLeft } from 'lucide-react';
import AttendanceManager from './components/AttendanceManager';
import GradesManager from './components/GradesManager';
import ActionHub from './components/ActionHub';
import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsubscribe = null;

    const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (currentUser) {
        try {
          profileUnsubscribe = onSnapshot(doc(db, 'teachers', currentUser.uid), (userDoc) => {
            if (userDoc.exists()) {
              setRole(userDoc.data().role || 'teacher');
            } else {
              setRole('teacher');
            }
          }, (e) => {
            console.error("Error fetching role snapshot", e);
            setRole('teacher');
          });
        } catch (e) {
          console.error("Error fetching role", e);
          setRole('teacher');
        }
        setUser(currentUser);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="chassis" style={{ justifyContent: 'center', alignItems: 'center' }}>Loading...</div>;
  }

  return (
    <Router>
      <div className="chassis">
        {user ? (
          <MainDashboard user={user} role={role} />
        ) : (
          <LoginScreen />
        )}
      </div>
    </Router>
  );
}

function LoginScreen() {
  const [teacherId, setTeacherId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  // Load saved teacher ID on mount (security enhancement: never save plaintext password)
  useEffect(() => {
    const savedId = localStorage.getItem('rememberedTeacherId');
    const savedFlag = localStorage.getItem('rememberMeFlag');
    if (savedFlag === 'true' && savedId) {
      setTeacherId(savedId);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const sanitizedId = teacherId.trim().replace(/@ace\.school$/i, '');
      const userCredential = await signInWithEmailAndPassword(auth, `${sanitizedId}@ace.school`, password);
      
      if (rememberMe) {
        localStorage.setItem('rememberedTeacherId', teacherId);
        localStorage.setItem('rememberMeFlag', 'true');
      } else {
        localStorage.removeItem('rememberedTeacherId');
        localStorage.removeItem('rememberMeFlag');
      }
      localStorage.removeItem('rememberedPassword'); // Ensure any legacy plaintext passwords are deleted
      
      await userCredential.user.getIdToken(true);
      
      const userDoc = await getDoc(doc(db, 'teachers', userCredential.user.uid));
      if (userDoc.exists() && !['teacher', 'admin', 'worker'].includes(userDoc.data().role)) {
        console.warn("User may not have required privileges.");
      }
    } catch (err) {
      console.error("Login failed:", err);
      setError('Invalid credentials or unauthorized access');
    }
  };

  return (
    <div className="login-container">
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <GraduationCap size={48} color="var(--emerald-400)" />
        <h1 style={{ color: 'var(--emerald-400)', marginTop: '1rem' }}>ACE Teacher Portal</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Log in to manage your classes</p>
      </div>

      <form onSubmit={handleLogin} style={{ width: '100%' }}>
        <input
          type="text"
          className="login-input"
          placeholder="Teacher ID (e.g. T123)"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          required
        />
        <input
          type="password"
          className="login-input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <input
            type="checkbox"
            id="rememberMe"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            style={{ marginRight: '0.5rem' }}
          />
          <label htmlFor="rememberMe" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Remember Me</label>
        </div>
        {error && <p style={{ color: 'var(--red-500)', marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</p>}
        <button type="submit" className="btn-primary">Authenticate</button>
        <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--emerald-400)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Forgot Password?
          </button>
        </div>
      </form>

      {showForgot && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
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
              onClick={() => setShowForgot(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              ← Close
            </button>
            <h3 style={{ color: 'var(--emerald-400)', marginBottom: '0.5rem', fontSize: '1.25rem' }}>Forgot Password</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>You don't have access. Contact Worker Web to change password.</p>
            <button
              onClick={() => setShowForgot(false)}
              style={{ marginTop: '1rem', background: 'transparent', border: '1px solid var(--emerald-400)', color: 'var(--emerald-400)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MainDashboard({ user, role }) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentTab = location.pathname === '/academics' 
    ? 'grades' 
    : location.pathname === '/action-hub' 
      ? 'action_hub' 
      : 'attendance';

  // Selection & index states
  const [attendanceClass, setAttendanceClass] = useState('');
  const [attendanceSection, setAttendanceSection] = useState('');
  const [attendanceIndex, setAttendanceIndex] = useState(0);

  const [gradesClass, setGradesClass] = useState('');
  const [gradesSection, setGradesSection] = useState('');

  const [actionHubClass, setActionHubClass] = useState('');
  const [actionHubSection, setActionHubSection] = useState('');

  const isInSubView = 
    (currentTab === 'attendance' && (attendanceClass !== '' || attendanceSection !== '')) || 
    (currentTab === 'grades' && (gradesClass !== '' || gradesSection !== '')) || 
    (currentTab === 'action_hub' && (actionHubClass !== '' || actionHubSection !== ''));

  const handleBack = () => {
    if (currentTab === 'attendance') {
      setAttendanceClass('');
      setAttendanceSection('');
    } else if (currentTab === 'grades') {
      setGradesClass('');
      setGradesSection('');
    } else if (currentTab === 'action_hub') {
      setActionHubClass('');
      setActionHubSection('');
    }
  };

  return (
    <>
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isInSubView && (
            <button 
              onClick={handleBack}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ArrowLeft size={24} />
            </button>
          )}
          <div className="brand-title">ACE Educator</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {role && <span style={{ fontSize: '0.75rem', color: 'var(--emerald-400)', border: '1px solid var(--emerald-400)', padding: '0.1rem 0.4rem', borderRadius: '1rem' }}>{role.toUpperCase()}</span>}
          <button 
            onClick={() => signOut(auth)} 
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="nav-tabs">
        <div 
          className={`nav-tab ${currentTab === 'attendance' ? 'active' : ''}`}
          onClick={() => navigate('/attendance')}
        >
          <Users size={18} style={{ margin: '0 auto 0.25rem' }} />
          <div style={{ fontSize: '0.75rem', fontWeight: '600' }}>Attendance</div>
        </div>
        <div 
          className={`nav-tab ${currentTab === 'grades' ? 'active' : ''}`}
          onClick={() => navigate('/academics')}
        >
          <GraduationCap size={18} style={{ margin: '0 auto 0.25rem' }} />
          <div style={{ fontSize: '0.75rem', fontWeight: '600' }}>Academics</div>
        </div>
        <div 
          className={`nav-tab ${currentTab === 'action_hub' ? 'active' : ''}`}
          onClick={() => navigate('/action-hub')}
        >
          <Activity size={18} style={{ margin: '0 auto 0.25rem' }} />
          <div style={{ fontSize: '0.75rem', fontWeight: '600' }}>Action Hub</div>
        </div>
      </div>

      <div className="content-area">
        <Routes>
          <Route path="/" element={<Navigate to="/attendance" replace />} />
          <Route 
            path="/attendance" 
            element={
              <AttendanceManager 
                selectedClass={attendanceClass}
                setSelectedClass={setAttendanceClass}
                selectedSection={attendanceSection}
                setSelectedSection={setAttendanceSection}
                currentIndex={attendanceIndex}
                setCurrentIndex={setAttendanceIndex}
              />
            } 
          />
          <Route 
            path="/academics" 
            element={
              <GradesManager 
                selectedClass={gradesClass}
                setSelectedClass={setGradesClass}
                selectedSection={gradesSection}
                setSelectedSection={setGradesSection}
              />
            } 
          />
          <Route 
            path="/action-hub" 
            element={
              <ActionHub 
                selectedClass={actionHubClass}
                setSelectedClass={setActionHubClass}
                selectedSection={actionHubSection}
                setSelectedSection={setActionHubSection}
                user={user}
              />
            } 
          />
          <Route path="*" element={<Navigate to="/attendance" replace />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
