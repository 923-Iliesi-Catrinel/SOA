import React, { useEffect, useState } from 'react';
import { 
  Paper, Table, TableBody, TableCell, TableHead, TableRow, 
  Button, Typography, Chip, TextField, Box, TableContainer
} from '@mui/material';
import axios from 'axios';
import { useAuth } from './AuthContext';

export default function Orders() {
  const { user, token } = useAuth(); 
  const [orders, setOrders] = useState([]);
  const [product, setProduct] = useState('Pfizer-BioNTech');
  const [quantity, setQuantity] = useState(100);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  // Load orders from Gateway
  const fetchOrders = async () => {
    try {
      const res = await axios.get('http://localhost:8080/api/orders/', getAuthHeaders());
      setOrders(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { 
      if (token) fetchOrders(); 
  }, [token]);

  const handleCreate = async () => {
    try {
      await axios.post(
          'http://localhost:8080/api/orders/', 
          { productName: product, quantity }, 
          getAuthHeaders()
      );
      fetchOrders();
      alert('Order Created!');
    } catch(err) { 
        console.error(err);
        alert('Error creating order'); 
    }
  };

  const handleDispatch = async (id) => {
    const truckId = prompt("Enter Truck ID (e.g., TRUCK-101):", "TRUCK-101");
    if (truckId) {
      try {
        await axios.put(
            `http://localhost:8080/api/orders/${id}/dispatch`, 
            { truckId }, 
            getAuthHeaders()
        );
        fetchOrders();
      } catch(err) { alert('Dispatch failed'); }
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Order Management</Typography>
      
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField label="Product" size="small" value={product} onChange={e => setProduct(e.target.value)} />
        <TextField label="Quantity" size="small" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
        <Button variant="contained" onClick={handleCreate}>Place Order</Button>
      </Paper>

      <TableContainer component={Paper}>
      <Table> 
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Product</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Truck</TableCell>
            <TableCell>Created By</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {orders.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.id}</TableCell>
              <TableCell>{row.productName} (x{row.quantity})</TableCell>
              <TableCell>
                <Chip 
                  label={row.status} 
                  color={row.status === 'DELIVERED' ? 'success' : row.status === 'SHIPPED' ? 'primary' : 'warning'} 
                />
              </TableCell>
              <TableCell>{row.truckId || '-'}</TableCell>
              <TableCell>{row.createdBy}</TableCell>
              <TableCell>
                {user.role === 'MANAGER' && row.status === 'PENDING' && (
                  <Button size="small" variant="outlined" onClick={() => handleDispatch(row.id)}>
                    Dispatch
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </Box>
);
}
