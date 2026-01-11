import React, { useState } from 'react';
import { TextField, Button, Paper, Typography, Box, Alert } from '@mui/material';
import { useAuth } from './AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success) {
      navigate('/');
    } else {
      setError('Invalid Credentials. Please try again.');
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
      <Paper elevation={3} sx={{ p: 4, width: 300 }}>
        <Typography variant="h5" mb={2} align="center">PharmaGuard Login</Typography>
        
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <form onSubmit={handleSubmit}>
          <TextField 
            fullWidth 
            label="Username" 
            margin="normal" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
          <TextField 
            fullWidth 
            label="Password" 
            type="password" 
            margin="normal" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
          />
          <Button fullWidth variant="contained" type="submit" sx={{ mt: 2 }}>
            Sign In
          </Button>
        </form>

        <Box mt={2} textAlign="center">
          <Link to="/register" style={{ textDecoration: 'none', color: '#1976d2' }}>
            Create New Account
          </Link>
        </Box>
      </Paper>
    </Box>
  );
}
