const express = require("express");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(express.json());

// ===============================
// 🔌 CONEXIÓN A MySQL
// ===============================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

// ===============================
// 🛠️ INICIALIZAR TABLAS
// ===============================
async function initDB() {
  try {
    console.log("🛠️ Creando tablas...");

    // Tabla Libros
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libros (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(200) NOT NULL,
        autor VARCHAR(200),
        categoria VARCHAR(100),
        precio DECIMAL(10,2) NOT NULL,
        stock INT NOT NULL,
        codigo VARCHAR(100) UNIQUE,
        imageUrl VARCHAR(300),
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla Cafés
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cafes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        tipo VARCHAR(100),
        origen VARCHAR(100),
        precio DECIMAL(10,2) NOT NULL,
        stock INT NOT NULL,
        codigo VARCHAR(100) UNIQUE,
        imageUrl VARCHAR(300),
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla Ventas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        producto_id INT NOT NULL,
        tipo_producto ENUM('libro','cafe') NOT NULL,
        cantidad INT NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        vendedor VARCHAR(100),
        cliente VARCHAR(100),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla Historial
    await pool.query(`
      CREATE TABLE IF NOT EXISTS historial (
        id INT AUTO_INCREMENT PRIMARY KEY,
        producto_id INT,
        tipo_producto ENUM('libro','cafe'),
        accion VARCHAR(200),
        usuario VARCHAR(100),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla Clientes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(200),
        saldo_total DECIMAL(10,2) DEFAULT 0.0
      )
    `);

    console.log("✅ Tablas listas");
  } catch (e) {
    console.error("❌ Error:", e.message);
  }
}

initDB();

// =====================================================================
// 📚 CRUD LIBROS
// =====================================================================

// Obtener libros
app.get("/libros", async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM libros ORDER BY id DESC");
  res.json(rows);
});

// Insertar libro
app.post("/libros", async (req, res) => {
  const { titulo, autor, categoria, precio, stock, codigo, imageUrl } = req.body;

  const [result] = await pool.query(
    `INSERT INTO libros (titulo, autor, categoria, precio, stock, codigo, imageUrl)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [titulo, autor, categoria, precio, stock, codigo, imageUrl]
  );

  res.status(201).json({ id: result.insertId, message: "Libro agregado" });
});

// =====================================================================
// ☕ CRUD CAFÉS
// =====================================================================

// Obtener cafés
app.get("/cafes", async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM cafes ORDER BY id DESC");
  res.json(rows);
});

// Insertar café
app.post("/cafes", async (req, res) => {
  const { nombre, tipo, origen, precio, stock, codigo, imageUrl } = req.body;

  const [result] = await pool.query(
    `INSERT INTO cafes (nombre, tipo, origen, precio, stock, codigo, imageUrl)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nombre, tipo, origen, precio, stock, codigo, imageUrl]
  );

  res.status(201).json({ id: result.insertId, message: "Café agregado" });
});

// =====================================================================
// 🛒 REGISTRO DE VENTAS
// =====================================================================
app.post("/ventas", async (req, res) => {
  const { producto_id, tipo_producto, cantidad, vendedor, cliente } = req.body;

  if (!["libro", "cafe"].includes(tipo_producto)) {
    return res.status(400).json({ error: "tipo_producto inválido" });
  }

  // Obtener precio
  const tabla = tipo_producto === "libro" ? "libros" : "cafes";
  const [[producto]] = await pool.query(`SELECT precio, stock FROM ${tabla} WHERE id=?`, [producto_id]);

  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

  if (producto.stock < cantidad) return res.status(400).json({ error: "Stock insuficiente" });

  const total = producto.precio * cantidad;

  // Insertar venta
  await pool.query(
    `INSERT INTO ventas (producto_id, tipo_producto, cantidad, total, vendedor, cliente)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [producto_id, tipo_producto, cantidad, total, vendedor, cliente]
  );

  // Actualizar stock
  await pool.query(`UPDATE ${tabla} SET stock = stock - ? WHERE id=?`, [cantidad, producto_id]);

  // Registrar historial
  await pool.query(
    `INSERT INTO historial (producto_id, tipo_producto, accion, usuario)
     VALUES (?, ?, 'Venta realizada', ?)`,
    [producto_id, tipo_producto, vendedor]
  );

  res.json({ message: "Venta registrada", total });
});

// =====================================================================
// 📜 HISTORIAL
// =====================================================================
app.get("/historial/:tipo/:id", async (req, res) => {
  const { tipo, id } = req.params;

  const [rows] = await pool.query(
    `SELECT * FROM historial WHERE tipo_producto=? AND producto_id=? ORDER BY fecha DESC`,
    [tipo, id]
  );

  res.json(rows);
});

// =====================================================================
// 🚀 INICIAR SERVIDOR
// =====================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Servidor activo en puerto ${PORT}`)
);
