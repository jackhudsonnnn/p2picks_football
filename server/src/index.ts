import { config } from './config/index.js';
// import { supabaseAdmin } from './config/supabaseClient'; // Example: if you need it here
// import express from 'express'; // Example: if using Express
// import mainRoutes from './routes'; // Example

// const app = express();
// app.use(express.json());

// app.get('/', (req, res) => {
//   res.send('Server is running!');
// });

// app.use('/api', mainRoutes); // Example

console.log(`Server starting on port ${config.port}`);
// app.listen(config.port, () => {
//   console.log(`Server listening at http://localhost:${config.port}`);
// });

// For now, just a log to show it can run
if (config.supabaseUrl) {
  console.log("Supabase URL is configured for the server.");
} else {
  console.log("Supabase URL is NOT configured for the server.");
}
