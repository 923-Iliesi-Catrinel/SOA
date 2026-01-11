import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, Navigate, Outlet } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Container, CircularProgress, Box } from '@mui/material';
import { AuthProvider, useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';
import Login from './Login';
import Orders from './Orders';
import Register from './Register';

// LAZY LOAD THE REMOTE DASHBOARD (From Port 4001)
const RemoteDashboard = React.lazy(() => import('dashboard/DashboardApp'));

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  
  if (!user) return <Navigate to="/login" />;
  const isDashboard = location.pathname === '/';

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>PharmaGuard Host</Typography>
          <Button color="inherit" component={Link} to="/">Dashboard</Button>
          <Button color="inherit" component={Link} to="/orders">Orders</Button>
          <Button color="error" onClick={logout} sx={{ ml: 2 }}>Logout</Button>
        </Toolbar>
      </AppBar>
      <Container 
        maxWidth={isDashboard ? false : 'lg'} 
        sx={{ mt: isDashboard ? 2 : 4, px: isDashboard ? 2 : undefined }}
      >
        <Outlet />
      </Container>
    </>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route element={<Layout />}>
            <Route path="/" element={
              <Suspense fallback={
                <Box display="flex" justifyContent="center" mt={5}>
                    <CircularProgress /> <Typography ml={2}>Loading Remote Dashboard...</Typography>
                </Box>
              }>
                <RemoteDashboard />
              </Suspense>
            } />
            <Route path="/orders" element={<Orders />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
