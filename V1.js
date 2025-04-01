

/// ***********************************************************************************************************************///
///*****************************************///Interfaz de Usuario (UI) ///************************************************//
///***********************************************************************************************************************///

// ********************************************Bloque 1: Configuración inicial del mapa *********************************//
var map = ui.Map();
ui.root.clear();
ui.root.add(map);
map.setCenter(-5.9, 43.3, 9); // Centramos el mapa en Asturias

// Cargar el contorno administrativo de Asturias desde FAO/GAUL/2015/level1
var asturias = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM1_NAME', 'Principado de Asturias'));

// Parámetros de visualización para el contorno
var visParams = {
  color: '#000000', // Color negro para el contorno
  fillColor: '00000000', // Fondo transparente usando formato hex RGBA
  width: 1 // Ancho del contorno
};

// Estilizar el contorno y agregarlo al mapa
var styledAsturias = asturias.style(visParams);
map.addLayer(styledAsturias, {}, 'Principado de Asturias');



// *****************************************Bloque 2: Herramientas de dibujo para ROI*************************************//
var roi = null;
var drawingTools = map.drawingTools();
drawingTools.setShown(true);
drawingTools.setShape('rectangle');
drawingTools.layers().reset();

drawingTools.onDraw(function() {
  var drawnLayer = drawingTools.layers().get(0);
  if (drawnLayer) {
    roi = drawnLayer.getEeObject();
    analyzeButton.setDisabled(false);
    print('ROI definido:', roi);
  }
});

drawingTools.onErase(function() {
  roi = null;
  analyzeButton.setDisabled(true);
  map.layers().reset();
});


// *********************************************** Bloque 3: Panel de control********************************************//

var startDateInput = ui.Textbox({
  placeholder: 'YYYY-MM-DD',
  value: '2023-03-15'
});
var endDateInput = ui.Textbox({
  placeholder: 'YYYY-MM-DD',
  value: '2023-07-30'
});

var yearDropdown = ui.Select({
  items: ['2019', '2020', '2021', '2022', '2023', '2024'],
  placeholder: 'Selecciona un año',
  value: '2022'
});

var analyzeButton = ui.Button({
  label: 'Analizar',
  onClick: function() {
    if (roi) {
      var startDate = startDateInput.getValue();
      var endDate = endDateInput.getValue();
      var compareYear = yearDropdown.getValue();
      analyzeBurnArea(roi, compareYear, startDate, endDate);
    } else {
      ui.alert('Por favor, dibuja un ROI primero.');
    }
  },
  disabled: true
});

var controlPanel = ui.Panel({
  widgets: [
    ui.Label('Herramienta de Análisis de Áreas Quemadas', {fontWeight: 'bold', fontSize: '18px'}),
    ui.Label('Paso 1: Dibuja un rectángulo para definir el ROI.'),
    ui.Label('Paso 2: Ingresa el rango de fechas para el análisis.'),
    ui.Label('Fecha de inicio:'),
    startDateInput,
    ui.Label('Fecha de fin:'),
    endDateInput,
    ui.Label('Paso 3: Selecciona el año de comparación:'),
    yearDropdown,
    analyzeButton
  ],
  style: {width: '300px', padding: '10px'}
});

ui.root.add(controlPanel);






///************************************************************* Funcionalidad Principal************************************************* ///

// Función para calcular el índice NBR
function Calc_NBR(image) {
  var nbr = image.expression('(nir-swir)/(nir+swir)', {
    'nir': image.select('B8'),
    'swir': image.select('B12')
  }).rename('NBR');
  return image.addBands(nbr);
}

// Función para procesar una colección de imágenes
function processCollection(collection) {
  return collection
    .map(function(image) {
      return image.updateMask(image.select('MSK_CLDPRB').lt(30)); // Máscara de nubes
    })
    .map(Calc_NBR)
    .select(['NBR']); // Mantener solo la banda NBR
}

// Función de análisis de áreas quemadas
function analyzeBurnArea(roi, compareYear, startDate, endDate) {
  // Colección de imágenes post-incendio
  var postCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(roi)
    .filterDate(startDate, endDate);

  // Crear fechas para pre-incendio
  var compareStart = startDate.replace(/\d{4}/, compareYear);
  var compareEnd = endDate.replace(/\d{4}/, compareYear);

  // Colección de imágenes pre-incendio
  var preCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(roi)
    .filterDate(compareStart, compareEnd);

  // Calcular NBR para cada período
  var preNBR = processCollection(preCollection).median().clip(roi);
  var postNBR = processCollection(postCollection).median().clip(roi);

  // Calcular la diferencia de NBR
  var diffNBR = postNBR.subtract(preNBR).rename('NBR_Change');

  // Parámetros de visualización
  var palette = {
    min: -1,
    max: 1,
    palette: ['#7E1E9C', '#A737D2', '#D56EFF', '#E6B8FF', '#FFFFB3', '#B8E186', '#7DB736', '#4C9100']
  };

  // Agregar capas al mapa
  map.layers().reset();
  map.addLayer(preNBR, {min: -1, max: 1, palette: palette.palette}, 'NBR Pre-Incendio');
  map.addLayer(postNBR, {min: -1, max: 1, palette: palette.palette}, 'NBR Post-Incendio');
  //map.addLayer(diffNBR, palette, 'dNBR');
}
