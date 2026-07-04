import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { OdinLogo } from './OdinLogo';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Inloggning misslyckades');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 30%, #171827 0%, #0a0a12 70%)',
    }}>
      <div style={{
        background: '#1b1c2c', border: '1px solid #2e2f45', borderRadius: 12,
        padding: '36px 32px', width: 340, boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/korp.png" alt="Korp" style={{ height: 90, width: 'auto', display: 'block', margin: '0 auto 16px' }} />
          <OdinLogo size="lg" />
          <p style={{ color: '#666a8c', fontSize: 11, marginTop: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Situational awareness</p>
        </div>
        <form onSubmit={submit}>
          <div className="field-row">
            <label>Användarnamn</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus required />
          </div>
          <div className="field-row">
            <label>Lösenord</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p style={{ color: '#f2545b', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: 12, marginTop: 4 }} disabled={loading}>
            {loading ? 'Loggar in...' : 'Logga in'}
          </button>
        </form>
      </div>
    </div>
  );
}
