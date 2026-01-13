import React from 'react';
import TruckMap from './TruckMap';

const App = (props) => {
  return (
    <div>
      <h2 style={{ color: '#1976d2', textAlign: 'center' }}>Logistics Dashboard</h2>
      <TruckMap {...props} />
    </div>
  );
};

export default App;
