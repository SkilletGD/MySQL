const express = require("express");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(express.json());

// Pool de conexión MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

/* ============================================================
   🔧 INICIALIZACIÓN DE TABLAS
============================================================ */
async function initDB() {
  try {
    console.log("Inicializando base de datos...");

    // Tabla rollos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rollos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo_tela VARCHAR(100) NOT NULL,
        color VARCHAR(50),
        codigo VARCHAR(50) UNIQUE NOT NULL,
        cantidad_total DECIMAL(10,2) NOT NULL,
        cantidad_restante DECIMAL(10,2) NOT NULL,
        fecha_compra DATE NOT NULL,
        proveedor VARCHAR(100),
        registrado_por VARCHAR(100),
        estado ENUM('Disponible', 'Vendido', 'Agotado') DEFAULT 'Disponible'
      )
    `);

    // Tabla ventas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rollo_id INT NOT NULL,
        cantidad_vendida DECIMAL(10,2) NOT NULL,
        fecha_venta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        vendedor VARCHAR(100),
        cliente VARCHAR(100),
        FOREIGN KEY (rollo_id) REFERENCES rollos(id) ON DELETE CASCADE
      )
    `);

    // Tabla historial
    await pool.query(`
      CREATE TABLE IF NOT EXISTS historial (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rollo_id INT,
        accion VARCHAR(100),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usuario VARCHAR(100),
        FOREIGN KEY (rollo_id) REFERENCES rollos(id) ON DELETE CASCADE
      )
    `);

    // Tabla clientes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        saldo_total DECIMAL(10,2) DEFAULT 0.00
      )
    `);

    console.log("✅ Tablas creadas correctamente");
  } catch (err) {
    console.error("❌ Error inicializando DB:", err.message);
  }
}

initDB();

/* ============================================================
   📦 RUTAS PARA ROLLOS
============================================================ */

// Obtener todos los rollos
app.get("/rollos", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM rollos ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear un nuevo rollo
app.post("/rollos", async (req, res) => {
  try {
    const {
      tipo_tela,
      color,
      codigo,
      cantidad_total,
      fecha_compra,
      proveedor,
      registrado_por
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO rollos (tipo_tela, color, codigo, cantidad_total, cantidad_restante, fecha_compra, proveedor, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tipo_tela, color, codigo, cantidad_total, cantidad_total, fecha_compra, proveedor, registrado_por]
    );

    // Registrar acción en historial
    await pool.query(
      `INSERT INTO historial (rollo_id, accion, usuario)
       VALUES (?, 'Rollo registrado', ?)`,
      [result.insertId, registrado_por]
    );

    res.status(201).json({ message: "Rollo agregado correctamente", id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar información del rollo
app.put("/rollos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo_tela, color, codigo, cantidad_total, cantidad_restante, proveedor, estado } = req.body;

    await pool.query(
      `UPDATE rollos SET tipo_tela=?, color=?, codigo=?, cantidad_total=?, cantidad_restante=?, proveedor=?, estado=? WHERE id=?`,
      [tipo_tela, color, codigo, cantidad_total, cantidad_restante, proveedor, estado, id]
    );

    res.json({ message: "Rollo actualizado correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar rollo
app.delete("/rollos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM rollos WHERE id=?", [id]);
    res.json({ message: "Rollo eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   💸 RUTAS PARA VENTAS
============================================================ */

// Registrar una venta parcial o total
app.post("/ventas", async (req, res) => {
  try {
    const { rollo_id, cantidad_vendida, vendedor, cliente } = req.body;

    // Registrar venta
    await pool.query(
      `INSERT INTO ventas (rollo_id, cantidad_vendida, vendedor, cliente)
       VALUES (?, ?, ?, ?)`,
      [rollo_id, cantidad_vendida, vendedor, cliente]
    );

    // Actualizar metros restantes
    const [[rollo]] = await pool.query("SELECT cantidad_restante FROM rollos WHERE id=?", [rollo_id]);
    const nuevaCantidad = rollo.cantidad_restante - cantidad_vendida;

    let nuevoEstado = "Disponible";
    if (nuevaCantidad <= 0) nuevoEstado = "Agotado";

    await pool.query(
      "UPDATE rollos SET cantidad_restante=?, estado=? WHERE id=?",
      [Math.max(nuevaCantidad, 0), nuevoEstado, rollo_id]
    );

    // Registrar acción en historial
    await pool.query(
      `INSERT INTO historial (rollo_id, accion, usuario)
       VALUES (?, 'Venta registrada', ?)`,
      [rollo_id, vendedor]
    );

    res.json({ message: "Venta registrada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener todas las ventas
app.get("/ventas", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT v.*, r.tipo_tela, r.color, r.codigo
      FROM ventas v
      JOIN rollos r ON v.rollo_id = r.id
      ORDER BY v.fecha_venta DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   📜 HISTORIAL
============================================================ */

app.get("/historial/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM historial WHERE rollo_id=? ORDER BY fecha DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   💰 CLIENTES
============================================================ */

// Obtener clientes
app.get("/clientes", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM clientes");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear cliente
app.post("/clientes", async (req, res) => {
  try {
    const { nombre, saldo_total } = req.body;
    const [result] = await pool.query(
      "INSERT INTO clientes (nombre, saldo_total) VALUES (?, ?)",
      [nombre, saldo_total]
    );
    res.status(201).json({ message: "Cliente agregado", id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   🌐 RUTA RAÍZ
============================================================ */
app.get("/", (req, res) => {
  res.send("✅ Servidor Node.js conectado a MySQL | Endpoints: /rollos /ventas /historial /clientes");
});

/* ============================================================
   🚀 INICIAR SERVIDOR
============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
