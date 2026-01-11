import React, { useState } from 'react';
import { TextField, Button, Paper, Typography, Box, Alert, MenuItem } from '@mui/material';
import { useAuth } from './AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('PHARMACIST');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

    const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await register(username, password, role); 
    
    if (result.success) {
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1500); 
    } else {
      setError(result.message || 'Registration failed.');
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
      <Paper elevation={3} sx={{ p: 4, width: 300 }}>
        <Typography variant="h5" mb={2} align="center">Create Account</Typography>
        
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>Account Created! Redirecting...</Alert>}

        <form onSubmit={handleSubmit}>
          <TextField 
            fullWidth label="Username" margin="normal" 
            value={username} onChange={(e) => setUsername(e.target.value)} required 
          />
          <TextField 
            fullWidth label="Password" type="password" margin="normal" 
            value={password} onChange={(e) => setPassword(e.target.value)} required 
          />
          
          <TextField
            select
            fullWidth
            label="Role"
            margin="normal"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <MenuItem value="PHARMACIST">Pharmacist (Place Orders)</MenuItem>
            <MenuItem value="MANAGER">Manager (Dispatch Trucks)</MenuItem>
          </TextField>

          <Button fullWidth variant="contained" type="submit" sx={{ mt: 2 }}>
            Register
          </Button>
          
          <Box mt={2} textAlign="center">
            <Link to="/login" style={{ textDecoration: 'none', color: '#1976d2' }}>
              Already have an account? Sign In
            </Link>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
