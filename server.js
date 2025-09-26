const express = require("express");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(express.json());

// Pool de MySQL para Aiven (modo fácil: ignorar certificado)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false } // ✅ ignorar certificado autofirmado
});

// Crear la tabla si no existe
async function initDB() {
  try {
    console.log("Creando tabla inventory si no existe...");
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
    console.log("Tabla inventory lista ✅");
  } catch (err) {
    console.error("Error inicializando DB:", err.message);
  }
}
initDB();

// Rutas básicas
app.get("/inventory", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM inventory");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/inventory", async (req, res) => {
  try {
    const { item, length, code, roll_no } = req.body;
    const [result] = await pool.query(
      "INSERT INTO inventory (item, length, code, roll_no) VALUES (?, ?, ?, ?)",
      [item, length, code, roll_no]
    );
    res.status(201).json({ id: result.insertId, item, length, code, roll_no });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM inventory WHERE id=?", [id]);
    res.json({ message: "Item eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Ruta raíz (opcional, solo para mostrar mensaje al entrar a /)
app.get("/", (req, res) => {
  res.send("¡Servidor Node.js conectado a Aiven! Usa /inventory para interactuar con la base de datos.");
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));


