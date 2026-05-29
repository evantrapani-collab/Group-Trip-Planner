import { createApp } from './app.js';

const port = process.env.PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`\n  ✈️  TripTogether running at http://localhost:${port}\n`);
});
