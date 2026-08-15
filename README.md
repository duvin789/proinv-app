# Kadmiel Multimuebles

Sistema de inventario de Kadmiel Multimuebles. El equipo registra productos y movimientos; la aplicación calcula automáticamente existencias, costo promedio, valorización, margen, utilidad, alertas y reportes.

Está construido con Next.js 16, React 19, Supabase y TypeScript. Supabase es el único origen de datos y el proyecto puede desplegarse directamente en Vercel.

## Funciones incluidas

- Panel con valor del inventario, unidades, utilidad proyectada y alertas.
- Catálogo de productos con búsqueda, filtros, estados y exportación Excel.
- Imágenes privadas por producto, con vista previa, reemplazo y eliminación.
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
- Importación validada desde `.xlsx`, con vista previa, detección de conflictos y decisión explícita entre omitir o actualizar datos comerciales sin modificar el stock existente.
- Plantilla Excel y exportación completa de datos operativos con inventario, existencias por almacén, movimientos, catálogos y resumen.
- Preferencias locales de tema, densidad y visibilidad de alertas.
- Borrado protegido de todos los datos operativos, disponible para propietarios y administradores.

## Cálculos automáticos

Kadmiel Multimuebles usa estas reglas:

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

Kadmiel Multimuebles no incluye datos simulados: productos, movimientos, configuración de empresa y cálculos se guardan en Supabase. Solo las preferencias visuales del dispositivo usan `localStorage`.

## Configurar Supabase

1. Crea un proyecto en Supabase.
2. Abre el editor SQL del proyecto.
3. Aplica, en orden, los archivos de `supabase/migrations/`. En un proyecto enlazado puedes ejecutar:

   ```bash
   npx supabase db push --linked
   ```

   La migración `202608060006_data_management.sql` agrega `max_stock` y las funciones transaccionales de datos. La migración `202608140007_product_images_and_admin.sql` agrega imágenes privadas, la creación de productos con imagen y la versión de `clear_inventory_data` autorizada para propietario o administrador. La migración `202608140008_excel_import_conflicts.sql` agrega la resolución explícita de conflictos al importar Excel.

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
- exportar todos los datos operativos del inventario en Excel con las hojas Inventario, Existencias por almacén, Movimientos, Catálogos y Resumen; tanto los saldos por almacén como el historial de movimientos se incluyen completos;
- borrar los datos operativos después de escribir `BORRAR TODO`.

La importación reconoce variaciones de mayúsculas, espacios y acentos en los encabezados. Las filas repetidas dentro del mismo archivo se consolidan: sus existencias se suman y los demás valores no vacíos de la última fila prevalecen, incluyendo categoría, proveedor, unidad y almacén. Si un producto ya existe con el mismo nombre y unidad, la vista previa obliga a elegir entre omitirlo o actualizar descripción, categoría y precios; ninguna de las dos opciones altera silenciosamente su stock. Categorías, proveedores y almacenes faltantes se crean dentro de la misma transacción.

## Imágenes privadas de productos

Las imágenes se guardan en el bucket privado `product-images` de Supabase Storage. La tabla de productos conserva únicamente la ruta privada y la aplicación las entrega mediante una ruta interna autenticada, sin incluir enlaces temporales en los datos del panel. Se admiten JPG, PNG y WebP de hasta 5 MB.

Las políticas de Storage aíslan los archivos por empresa. Las personas con acceso a la empresa pueden verlos, mientras que propietarios, administradores y operadores pueden cargarlos, reemplazarlos o eliminarlos. La exportación Excel incluye la ruta privada de cada imagen como metadato, pero no expone URLs firmadas ni datos de acceso. Los archivos binarios de las imágenes no se incrustan en el libro, por lo que este Excel no constituye por sí solo una copia restaurable de esas imágenes.

## Roles y seguridad

La migración habilita Row Level Security en todas las tablas.

| Rol | Consultar | Operar stock | Configurar empresa |
| --- | --- | --- | --- |
| Propietario | Sí | Sí | Sí |
| Administrador | Sí | Sí | Sí |
| Operador | Sí | Sí | No |
| Consulta | Sí | No | No |

Las funciones sensibles validan nuevamente el usuario, la empresa, el rol, el producto y el almacén. Las tablas de saldos y movimientos no admiten escrituras directas desde el cliente.

El borrado total elimina productos, movimientos, saldos, catálogos operativos e imágenes asociadas. Conserva la cuenta, la empresa y el almacén principal para que el propietario o administrador pueda volver a empezar sin recrear el acceso.

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
