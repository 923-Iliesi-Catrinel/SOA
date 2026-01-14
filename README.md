# PharmaGuard - Cold Medicine & Vaccines Logistics App For Hospitals/Pharmacies
PharmaGuard is a distributed microservices platform for tracking pharmaceutical shipments in real-time. It solves the communication gap in logistics by using an event-driven architecture to synchronize data across multiple servers. The system ingests high-frequency telemetry from trucks, processes critical alerts (like temperature deviations or crash shocks)  and broadcasts them instantly to a dashboard using WebSockets. It supports horizontal scalability, allowing multiple server instances to function as a unified cluster.

### System Components
1. API Gateway - The single entry point for all client requests. It handles load balancing and routes traffic to the appropriate internal microservices. It is configured with sticky sessions (ip_hash) to ensure stable WebSocket connections during the handshake process. Technology: NGINX
2. Frontend Microservices - Connect to the backend via WebSockets to receive instant updates without refreshing the page. Technology: React.js, Webpack Module Federation, Leaflet Maps, Socket.IO
3. Authentication Service - It issues JSON Web Tokens (JWT) which are required to authorize requests to all other services in the system. Technology: Node.js, Express, PostgreSQL
4. Order Service - Handles the business logic for creating and managing shipment orders. It publishes events to a message queue whenever an order is created or updated. Technology: Node.js, Express, PostgreSQL, RabbitMQ
5. Telemetry Service - Acts as the high-speed ingestion point for sensor data. It receives GPS coordinates, temperature readings and vibration logs from trucks and pushes them directly to a streaming platform to prevent database bottlenecks. Technology: Node.js, Apache Kafka (Producer), PostgreSQL
6. Notification Service - It consumes data streams from Kafka and business events from RabbitMQ. It detects critical anomalies (such as crashes) and broadcasts alerts to users. It uses a Redis to scale horizontally, ensuring users connected to different servers still receive the same messages. Technology: Node.js, Socket.IO, Redis Pub/Sub, Kafka (Consumer)
7. Serverless Functions (FaaS)
- Risk Calculator: Calculates estimated financial loss based on cargo value when a crash occurs.
- Email Sender: Sends urgent SMTP email notifications to logistics managers
Technologies: OpenFaaS, MailHog
8. Deployment & Containerization - The entire system is containarized. Technology: Docker
