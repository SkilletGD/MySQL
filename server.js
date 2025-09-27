const express = require("express");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(express.json());

// Pool de MySQL para Aiven (ignorar certificado autofirmado)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

// Inicializar todas las tablas
async function initDB() {
  try {
    console.log("Inicializando base de datos...");

    // Tabla inventory
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item VARCHAR(100) NOT NULL,
        length DECIMAL(10,2),
        code VARCHAR(50),
        roll_no VARCHAR(50),
        qr_code TEXT
      )
    `);

    // Tabla sales
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_name VARCHAR(100),
        item VARCHAR(100),
        length DECIMAL(10,2),
        roll_no VARCHAR(50),
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla collection (cobranza)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collection (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_name VARCHAR(100),
        total_balance DECIMAL(10,2)
      )
    `);

    // Tabla out_of_stock
    await pool.query(`
      CREATE TABLE IF NOT EXISTS out_of_stock (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item VARCHAR(100),
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tablas listas ✅");
  } catch (err) {
    console.error("Error inicializando DB:", err.message);
  }
}
initDB();

/* -------------------- RUTAS CRUD -------------------- */

// INVENTORY
app.get("/inventory", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM inventory");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/inventory", async (req, res) => {
  try {
    const { item, length, code, roll_no } = req.body;
    const [result] = await pool.query(
      "INSERT INTO inventory (item, length, code, roll_no) VALUES (?, ?, ?, ?)",
      [item, length, code, roll_no]
    );
    res.status(201).json({ id: result.insertId, item, length, code, roll_no });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { item, length, code, roll_no } = req.body;
    await pool.query(
      "UPDATE inventory SET item=?, length=?, code=?, roll_no=? WHERE id=?",
      [item, length, code, roll_no, id]
    );
    res.json({ id, item, length, code, roll_no });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM inventory WHERE id=?", [id]);
    res.json({ message: "Item eliminado" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SALES
app.get("/sales", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM sales");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/sales", async (req, res) => {
  try {
    const { client_name, item, length, roll_no } = req.body;
    const [result] = await pool.query(
      "INSERT INTO sales (client_name, item, length, roll_no) VALUES (?, ?, ?, ?)",
      [client_name, item, length, roll_no]
    );
    res.status(201).json({ id: result.insertId, client_name, item, length, roll_no });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// COLLECTION
app.get("/collection", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM collection");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/collection", async (req, res) => {
  try {
    const { client_name, total_balance } = req.body;
    const [result] = await pool.query(
      "INSERT INTO collection (client_name, total_balance) VALUES (?, ?)",
      [client_name, total_balance]
    );
    res.status(201).json({ id: result.insertId, client_name, total_balance });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// OUT_OF_STOCK
app.get("/out_of_stock", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM out_of_stock ORDER BY date DESC LIMIT 7");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/out_of_stock", async (req, res) => {
  try {
    const { item } = req.body;
    const [result] = await pool.query(
      "INSERT INTO out_of_stock (item) VALUES (?)",
      [item]
    );
    res.status(201).json({ id: result.insertId, item });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ruta raíz
app.get("/", (req, res) => {
  res.send("¡Servidor Node.js conectado a Aiven! Usa /inventory, /sales, /collection, /out_of_stock");
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));


