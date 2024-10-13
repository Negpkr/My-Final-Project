const { MongoClient } = require('mongodb');

// MongoDB connection
const uri = 'mongodb+srv://neginpakrooh:7jRFiBfCPUZnK9jm@sit314.wplq9.mongodb.net/?retryWrites=true&w=majority&appName=sit314';
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate random data for a given plant
function generateRandomData(plantName) {
  const data = [];
  for (let i = 0; i < 15; i++) {
    const entry = {
      plant: plantName,
      status: Math.random() > 0.5 ? 'on' : 'off', // Randomly 'on' or 'off'
      temperature: getRandomInt(15, 35), // Random temperature between 15 and 35
      soilMoisture: getRandomInt(300, 800), // Random soil moisture between 300 and 800
      timestamp: new Date(Date.now() - getRandomInt(0, 7) * 24 * 60 * 60 * 1000), // Random timestamp within the last 7 days
    };
    data.push(entry);
  }
  return data;
}

// Insert random data into MongoDB
async function insertRandomData() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const database = client.db('plantsData');
    const collection = database.collection('plantsData');

    const plants = ['A', 'B', 'C'];
    const allData = plants.flatMap(plant => generateRandomData(plant));

    const result = await collection.insertMany(allData);
    console.log(`${result.insertedCount} documents inserted.`);
  } catch (error) {
    console.error('Error inserting data:', error);
  } finally {
    await client.close();
  }
}

insertRandomData();
