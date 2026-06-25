import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './AuthPage.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ username, password });
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>♟ AdFreeChess</h1>
        <h2 className={styles.subtitle}>Log in</h2>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Username
            <input className={styles.input} type="text" value={username} onChange={e => setUsername(e.target.value)} required />
          </label>
          <label className={styles.label}>
            Password
            <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className={styles.footer}>
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
