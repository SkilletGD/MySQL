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
   🔧 INICIALIZACIÓN DE TABLAS CON SISTEMA DE PRECIOS
============================================================ */
async function initDB() {
  try {
    console.log("🏗️ Inicializando base de datos con sistema de precios...");

    // Tabla rollos - CON PRECIOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rollos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo_tela VARCHAR(100) NOT NULL,
        color VARCHAR(50),
        codigo VARCHAR(50) UNIQUE NOT NULL,
        cantidad_total DECIMAL(10,2) NOT NULL,
        cantidad_restante DECIMAL(10,2) NOT NULL,
        precio_por_metro DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        precio_rollo_completo DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        fecha_compra DATE NOT NULL,
        proveedor VARCHAR(100),
        registrado_por VARCHAR(100),
        estado ENUM('Disponible', 'Vendido', 'Agotado') DEFAULT 'Disponible',
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla ventas - CON PRECIO TOTAL
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rollo_id INT NOT NULL,
        cantidad_vendida DECIMAL(10,2) NOT NULL,
        precio_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
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
        detalles TEXT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usuario VARCHAR(100),
        FOREIGN KEY (rollo_id) REFERENCES rollos(id) ON DELETE CASCADE
      )
    `);

    console.log("✅ Tablas creadas correctamente con sistema de precios");

    // Migrar tablas existentes si es necesario
    await migrateExistingTables();

  } catch (err) {
    console.error("❌ Error inicializando DB:", err.message);
  }
}

// Función para migrar tablas existentes
async function migrateExistingTables() {
  try {
    console.log("🔄 Verificando migraciones necesarias...");
    
    // Verificar y agregar columnas de precios a rollos si no existen
    try {
      await pool.query("ALTER TABLE rollos ADD COLUMN precio_por_metro DECIMAL(10,2) DEFAULT 0.00");
      console.log("✅ Columna precio_por_metro agregada a rollos");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("ℹ️ Columna precio_por_metro ya existe");
      }
    }
    
    try {
      await pool.query("ALTER TABLE rollos ADD COLUMN precio_rollo_completo DECIMAL(10,2) DEFAULT 0.00");
      console.log("✅ Columna precio_rollo_completo agregada a rollos");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("ℹ️ Columna precio_rollo_completo ya existe");
      }
    }
    
    try {
      await pool.query("ALTER TABLE rollos ADD COLUMN fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
      console.log("✅ Columna fecha_creacion agregada a rollos");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("ℹ️ Columna fecha_creacion ya existe");
      }
    }

    // Verificar y agregar columna de precio_total a ventas
    try {
      await pool.query("ALTER TABLE ventas ADD COLUMN precio_total DECIMAL(10,2) DEFAULT 0.00");
      console.log("✅ Columna precio_total agregada a ventas");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("ℹ️ Columna precio_total ya existe");
      }
    }

    // Verificar y agregar columna detalles a historial
    try {
      await pool.query("ALTER TABLE historial ADD COLUMN detalles TEXT");
      console.log("✅ Columna detalles agregada a historial");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("ℹ️ Columna detalles ya existe");
      }
    }

    console.log("✅ Migración completada");

  } catch (err) {
    console.log("ℹ️ Las tablas ya están actualizadas:", err.message);
  }
}

initDB();

/* ============================================================
   📦 RUTAS PARA ROLLOS - ACTUALIZADAS CON PRECIOS
============================================================ */

// Obtener todos los rollos CON PRECIOS
app.get("/rollos", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM rollos ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear un nuevo rollo CON PRECIOS
app.post("/rollos", async (req, res) => {
  try {
    const { 
      tipo_tela, color, codigo, cantidad_total, 
      precio_por_metro, precio_rollo_completo,
      fecha_compra, proveedor, registrado_por 
    } = req.body;

    // Validar campos obligatorios
    if (!tipo_tela || !color || !codigo || !cantidad_total) {
      return res.status(400).json({ error: "Campos obligatorios faltantes" });
    }

    // Insertar el rollo CON PRECIOS
    const [result] = await pool.query(
      `INSERT INTO rollos (tipo_tela, color, codigo, cantidad_total, cantidad_restante, 
                          precio_por_metro, precio_rollo_completo, fecha_compra, proveedor, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tipo_tela, color, codigo, cantidad_total, cantidad_total, 
       precio_por_metro || 0.00, precio_rollo_completo || 0.00, fecha_compra, proveedor, registrado_por]
    );

    // Registrar acción en historial
    await pool.query(
      `INSERT INTO historial (rollo_id, accion, detalles, usuario)
       VALUES (?, 'Rollo registrado', ?, ?)`,
      [result.insertId, 
       `Tela: ${tipo_tela}, Color: ${color}, Precio/m: $${precio_por_metro || 0}, Precio rollo: $${precio_rollo_completo || 0}`, 
       registrado_por]
    );

    // Traer el rollo recién creado
    const [[nuevoRollo]] = await pool.query("SELECT * FROM rollos WHERE id=?", [result.insertId]);

    res.status(201).json(nuevoRollo);

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: "El código del rollo ya existe" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Actualizar información del rollo CON PRECIOS
app.put("/rollos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      tipo_tela, color, codigo, cantidad_total, cantidad_restante, 
      precio_por_metro, precio_rollo_completo, proveedor, estado 
    } = req.body;

    await pool.query(
      `UPDATE rollos SET tipo_tela=?, color=?, codigo=?, cantidad_total=?, cantidad_restante=?,
                        precio_por_metro=?, precio_rollo_completo=?, proveedor=?, estado=? 
       WHERE id=?`,
      [tipo_tela, color, codigo, cantidad_total, cantidad_restante, 
       precio_por_metro, precio_rollo_completo, proveedor, estado, id]
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
   💸 RUTAS PARA VENTAS - ACTUALIZADAS CON PRECIO TOTAL
============================================================ */

// Registrar una venta CON PRECIO TOTAL (calculado en la app)
app.post("/ventas", async (req, res) => {
  try {
    const { rollo_id, cantidad_vendida, precio_total, vendedor, cliente } = req.body;

    // Validar campos obligatorios
    if (!rollo_id || !cantidad_vendida || !vendedor) {
      return res.status(400).json({ error: "Datos de venta incompletos" });
    }

    // 1. Obtener información del rollo para validar stock
    const [[rollo]] = await pool.query(
      "SELECT cantidad_restante, tipo_tela, color, codigo FROM rollos WHERE id=?", 
      [rollo_id]
    );

    if (!rollo) {
      return res.status(404).json({ error: "Rollo no encontrado" });
    }

    // 2. Validar que hay suficiente cantidad
    if (rollo.cantidad_restante < cantidad_vendida) {
      return res.status(400).json({ 
        error: `Cantidad insuficiente. Disponible: ${rollo.cantidad_restante}m, Solicitado: ${cantidad_vendida}m` 
      });
    }

    // 3. Registrar la venta CON PRECIO TOTAL (ya calculado en la app)
    const [ventaResult] = await pool.query(
      `INSERT INTO ventas (rollo_id, cantidad_vendida, precio_total, vendedor, cliente)
       VALUES (?, ?, ?, ?, ?)`,
      [rollo_id, cantidad_vendida, precio_total || 0.00, vendedor, cliente]
    );

    // 4. Actualizar metros restantes y estado
    const nuevaCantidad = rollo.cantidad_restante - cantidad_vendida;
    let nuevoEstado = "Disponible";
    if (nuevaCantidad <= 0) nuevoEstado = "Agotado";

    await pool.query(
      "UPDATE rollos SET cantidad_restante=?, estado=? WHERE id=?",
      [Math.max(nuevaCantidad, 0), nuevoEstado, rollo_id]
    );

    // 5. Registrar acción en historial
    await pool.query(
      `INSERT INTO historial (rollo_id, accion, detalles, usuario)
       VALUES (?, 'Venta registrada', ?, ?)`,
      [rollo_id, 
       `${cantidad_vendida}m de ${rollo.tipo_tela} ${rollo.color} vendidos por $${precio_total || 0}`, 
       vendedor]
    );

    res.json({ 
      message: "✅ Venta registrada correctamente",
      venta: {
        id: ventaResult.insertId,
        rollo_id,
        cantidad_vendida,
        precio_total: precio_total || 0.00,
        metros_restantes: nuevaCantidad,
        estado: nuevoEstado
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener todas las ventas CON INFORMACIÓN COMPLETA
app.get("/ventas", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        v.*, 
        r.tipo_tela, 
        r.color, 
        r.codigo,
        r.precio_por_metro
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
   📊 ESTADÍSTICAS Y REPORTES
============================================================ */

// Obtener estadísticas generales de ventas
app.get("/estadisticas/ventas", async (req, res) => {
  try {
    const [result] = await pool.query(`
      SELECT 
        COUNT(*) as total_ventas,
        SUM(cantidad_vendida) as total_metros_vendidos,
        SUM(precio_total) as total_ingresos,
        AVG(precio_total) as promedio_venta
      FROM ventas
    `);
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener estadísticas de inventario
app.get("/estadisticas/inventario", async (req, res) => {
  try {
    const [result] = await pool.query(`
      SELECT 
        COUNT(*) as total_rollos,
        SUM(cantidad_restante) as metros_totales_disponibles,
        SUM(precio_rollo_completo) as valor_total_inventario
      FROM rollos
    `);
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   📜 HISTORIAL
============================================================ */

// Obtener historial de un rollo
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
   🌐 RUTA RAÍZ
============================================================ */
app.get("/", (req, res) => {
  res.json({
    message: "✅ Servidor de Gestión de Telas con Sistema de Precios",
    version: "2.0",
    features: [
      "Sistema completo de precios",
      "Cálculos en app móvil",
      "Gestión de inventario",
      "Reportes de ventas"
    ]
  });
});

/* ============================================================
   🚀 INICIAR SERVIDOR
============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`💰 Sistema de precios activado - Cálculos en Kotlin`);
  console.log(`📊 Base de datos lista para recibir precios`);
});
