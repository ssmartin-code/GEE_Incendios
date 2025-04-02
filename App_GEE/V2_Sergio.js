///🛰️ 1. Carga de datos y centrado///

var sentinel2 = ee.ImageCollection("COPERNICUS/S2_SR");
var area = ee.FeatureCollection(roi);
var pt = area.geometry().centroid(100);

// Mostrar contorno de Asturias sin relleno para mejor orientación geográfica
var asturias = ee.FeatureCollection('projects/ee-srssmartin/assets/Asturias_SHP');
Map.centerObject(asturias, 9);
var asturiasStyle = asturias.style({
  color: 'black',
  width: 1,
  fillColor: '00000000' // Transparente
});
Map.addLayer(asturiasStyle, {}, 'Principado de Asturias');



// ☁️ 2. Enmascaramiento de nubes
function maskS2sr(image) {
  // Verifica si la banda QA60 está presente
  var bandNames = image.bandNames();
  var hasQA60 = bandNames.contains('QA60');
  var maskQA = ee.Image(1);  // por defecto no enmascara nada

  // Si tiene QA60, aplicar la máscara de nubes y cirros
  maskQA = ee.Algorithms.If(hasQA60,
    image.select('QA60').bitwiseAnd(1 << 10).eq(0)
         .and(image.select('QA60').bitwiseAnd(1 << 11).eq(0)),
    maskQA
  );
  maskQA = ee.Image(maskQA); // convertir If a imagen válida

  // Máscara con SCL (más precisa)
  var scl = image.select('SCL');
  var maskSCL = scl.neq(3)   // sombra de nube
                   .and(scl.neq(8))  // nubes medias
                   .and(scl.neq(9))  // nubes densas
                   .and(scl.neq(10)) // cirros
                   .and(scl.neq(1)); // píxel saturado/no clasificado

  // Validar que todas las bandas relevantes tengan valores > 0
  var validBands = image.select(['B2', 'B3', 'B4', 'B8', 'B8A', 'B11', 'B12'])
                        .reduce(ee.Reducer.min()).gt(0);

  // Máscara combinada
  var combinedMask = maskQA.and(maskSCL).and(validBands);

  return image.updateMask(combinedMask).copyProperties(image, ['system:time_start']);
}



// Fechas pre y post incendio
var preStart = '2021-05-01';
var preEnd   = '2021-11-15';
var postStart = '2023-05-01';
var postEnd   = '2023-11-15';


var selectedBands = ['B2', 'B3', 'B4', 'B8', 'B8A', 'B11', 'B12', 'SCL'];


var preComposite = sentinel2
  .filterDate(preStart, preEnd)
  .filterBounds(area)
  .map(maskS2sr)
  .select(selectedBands) // <--- Esta línea es nueva
  .median()
  .clip(area);

var postComposite = sentinel2
  .filterDate(postStart, postEnd)
  .filterBounds(area)
  .map(maskS2sr)
  .select(selectedBands) // <--- Esta línea es nueva
  .median()
  .clip(area);






//Visualizacion RGB
Map.addLayer(preComposite, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}, 'Pre incendio RGB');
Map.addLayer(postComposite, {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}, 'Post incendio RGB');


// dNBR
var NBRantes = preComposite.normalizedDifference(['B8A', 'B12']).rename('NBRantes');
var NBRdespues = postComposite.normalizedDifference(['B8A', 'B12']).rename('NBRdespues');
var dNBR = NBRantes.subtract(NBRdespues).rename('dNBR').clip(area);

Map.addLayer(dNBR, {
  min: -0.1,
  max: 0.6,
  palette: ['green', 'yellow', 'orange', 'red', 'black']
}, 'dNBR');

var clasificacion = dNBR.expression(
  "b('dNBR') < 0 ? 0" +
  ": b('dNBR') < 0.1 ? 1" +
  ": b('dNBR') < 0.27 ? 2" +
  ": b('dNBR') < 0.44 ? 3" +
  ": b('dNBR') < 0.66 ? 4" +
  ": 5"
).rename('dNBR_class').clip(area);



// Añadir clasificación al mapa
var classPalette = ['cyan', 'green', 'yellow', 'orange', 'red', 'black'];
Map.addLayer(clasificacion, {
  min: 0,
  max: 6,
  palette: classPalette
}, 'Clasificación');

// Área quemada (clases 3 a 6)
var fire_area = clasificacion.updateMask(clasificacion.gte(3));

// Añadir capa de fuego
Map.addLayer(fire_area, {
  min: 3,
  max: 6,
  palette: ['yellow', 'orange', 'brown', 'black']
}, 'Área quemada');

// Vectorización
var vector = fire_area.reduceToVectors({
  geometry: area,
  scale: 20,
  geometryType: 'polygon',
  reducer: ee.Reducer.countEvery(),
  maxPixels: 1e8
});
Map.addLayer(vector, {}, 'Vector incendio');

// Cálculo del área
var areaQuemada = ee.Image.pixelArea()
  .divide(10000)
  .updateMask(fire_area)
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: area,
    scale: 20,
    maxPixels: 1e13
});
print('Área total quemada (ha):', areaQuemada);

// Exportar
Export.table.toDrive({
  collection: vector,
  folder: 'Indice_Severidad_Incendios',
  description: 'fire_area_vector',
  fileFormat: 'SHP'
});



// ----------------- LEYENDA ------------------ //
var legend = ui.Panel({style: {position: 'bottom-left'}});
legend.add(ui.Label('Leyenda - Severidad dNBR', {fontWeight: 'bold'}));

var legendItems = [
  ['Alta regeneración post-fuego', 'cyan'],
  ['Baja regeneración post-fuego', 'blue'],
  ['No quemado', 'green'],
  ['Quema leve', 'yellow'],
  ['Severidad moderada-baja', 'orange'],
  ['Severidad moderada-alta', 'brown'],
  ['Alta severidad', 'black']
];

legendItems.forEach(function(item, i) {
  legend.add(ui.Panel([
    ui.Label({style: {backgroundColor: item[1], padding: '8px', margin: '0'}}),
    ui.Label(item[0], {margin: '0 0 4px 6px'})
  ], ui.Panel.Layout.Flow('horizontal')));
});

Map.add(legend);
