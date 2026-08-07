# Almacén LuisGB

Sistema de inventario para pequeñas y medianas empresas. El usuario registra productos y movimientos; Almacén LuisGB calcula automáticamente existencias, costo promedio, valorización, margen, utilidad, alertas y reportes.

Está construido con Next.js 16, React 19, Supabase y TypeScript. Supabase es el único origen de datos y el proyecto puede desplegarse directamente en Vercel.

## Funciones incluidas

- Panel con valor del inventario, unidades, utilidad proyectada y alertas.
- Catálogo de productos con búsqueda, filtros, estados y exportación Excel.
- SKU automático cuando el usuario no ingresa uno.
- Entradas, ventas, ajustes y devoluciones con historial completo.
- Prevención de stock negativo dentro de una transacción de base de datos.
- Costo promedio ponderado recalculado con cada entrada.
- Costo de venta y utilidad bruta calculados con cada salida por venta.
- Alertas por stock mínimo, stock máximo opcional y sugerencias de reposición.
- Reportes de valorización, rentabilidad, ventas e impuesto estimado.
- Categorías, proveedores, empresa, moneda, impuestos y almacenes.
- Modo claro y oscuro, diseño adaptable a escritorio, tableta y móvil.
- Inicio de sesión simplificado, roles y aislamiento por empresa mediante Supabase Auth y RLS.
- Exportaciones `.xlsx` para productos, movimientos y reportes.
- Importación validada desde `.xlsx`, con vista previa y consolidación de nombres repetidos.
- Plantilla Excel y respaldo completo con inventario, movimientos, catálogos y resumen.
- Preferencias locales de tema, densidad y visibilidad de alertas.
- Borrado protegido de todos los datos operativos, exclusivo del propietario.

## Cálculos automáticos

Almacén LuisGB usa estas reglas:

```text
Nuevo stock = stock anterior + entradas - salidas

Costo promedio =
  (valor anterior + cantidad comprada x costo de entrada)
  / nuevo stock

Valor del inventario = stock actual x costo promedio

Utilidad por venta = ingreso de la venta - costo de las unidades vendidas

Margen bruto = (precio de venta - costo promedio) / precio de venta x 100

Reposición sugerida = máximo(objetivo - stock actual, stock mínimo - stock actual, 0)

Objetivo = stock máximo, cuando está configurado;
           en caso contrario, stock mínimo x 2
```

En Supabase, los cambios de stock y sus cálculos se ejecutan dentro de funciones transaccionales con bloqueo de filas. Dos operaciones simultáneas no pueden gastar las mismas unidades.

## Ejecutar localmente

Requisitos:

- Node.js 24.
- npm.
- Un proyecto de Supabase configurado.

Instala y ejecuta:

```bash
npm install
npm run dev
```

Antes de iniciar, crea `.env.local` a partir de `.env.example` y completa las variables públicas de Supabase. Después abre `http://localhost:3000` e inicia sesión. Las cuentas y sus permisos se administran desde Supabase.

Almacén LuisGB no incluye datos simulados: productos, movimientos, configuración de empresa y cálculos se guardan en Supabase. Solo las preferencias visuales del dispositivo usan `localStorage`.

## Configurar Supabase

1. Crea un proyecto en Supabase.
2. Abre el editor SQL del proyecto.
3. Aplica, en orden, los archivos de `supabase/migrations/`. En un proyecto enlazado puedes ejecutar:

   ```bash
   npx supabase db push --linked
   ```

   La migración `202608060006_data_management.sql` agrega `max_stock` y las funciones transaccionales `create_product_with_stock_v2`, `import_inventory_products` y `clear_inventory_data`.

4. En Supabase, copia la URL del proyecto y su clave pública o publishable key.
5. Duplica `.env.example` como `.env.local` y completa:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
```

6. En Supabase Authentication, agrega estas URL permitidas:

```text
http://localhost:3000/auth/callback
https://TU-DOMINIO.vercel.app/auth/callback
```

Al crear una persona en Supabase Auth, la base de datos crea automáticamente:

- su perfil;
- una empresa propia;
- la membresía con rol de propietario;
- el almacén principal;
- cuatro categorías iniciales.

No uses `SUPABASE_SERVICE_ROLE_KEY` en el navegador ni en variables con prefijo `NEXT_PUBLIC_`. Esta aplicación no necesita esa clave.

## Importar y exportar Excel

En **Configuración > Datos** puedes:

- descargar una plantilla `.xlsx` con los encabezados admitidos;
- importar hasta 1000 filas o 10 MB con vista previa;
- exportar un respaldo con las hojas Inventario, Movimientos, Catálogos y Resumen;
- borrar los datos operativos después de escribir `BORRAR TODO`.

La importación reconoce variaciones de mayúsculas, espacios y acentos en los encabezados. Las filas con el mismo nombre y unidad se consolidan sumando existencias; los productos ya existentes con esa misma identidad se omiten. Categorías, proveedores y almacenes faltantes se crean dentro de la misma transacción.

## Roles y seguridad

La migración habilita Row Level Security en todas las tablas.

| Rol | Consultar | Operar stock | Configurar empresa |
| --- | --- | --- | --- |
| Propietario | Sí | Sí | Sí |
| Administrador | Sí | Sí | Sí |
| Operador | Sí | Sí | No |
| Consulta | Sí | No | No |

Las funciones sensibles validan nuevamente el usuario, la empresa, el rol, el producto y el almacén. Las tablas de saldos y movimientos no admiten escrituras directas desde el cliente.

## Desplegar en Vercel

1. Sube el proyecto a un repositorio Git.
2. Importa el repositorio en Vercel.
3. Mantén el framework detectado como Next.js.
4. Agrega las dos variables de Supabase en Project Settings > Environment Variables.
5. Despliega.
6. Copia el dominio final en las URL permitidas de Supabase Authentication.

El comando de producción es:

```bash
npm run build
```

No se requiere `vercel.json`. Next.js y las rutas del servidor se detectan automáticamente.

## Estructura principal

```text
src/app/                  Rutas, acciones del servidor y autenticación
src/components/           Panel, productos, movimientos, reportes y ajustes
src/lib/                  Cálculos, tipos, acceso a datos y clientes Supabase
supabase/migrations/      Esquema, RLS y funciones transaccionales
src/proxy.ts              Renovación segura de sesión en Next.js 16
```

## Verificación

Antes de desplegar:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit
```

Todos los comandos deben terminar sin errores.
