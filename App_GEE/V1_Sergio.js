

/// ***********************************************************************************************************************///
///*****************************************///Interfaz de Usuario (UI) ///************************************************//
///***********************************************************************************************************************///
/* funciones comunes */
var pad = function(n) {
  return n < 10 ? '0' + n : n;
};

// 1) Variables para exportar
var preNBRImageForExport  = null;
var postNBRImageForExport = null;
var diffNBRImageForExport = null;
var severityImageForExport = null;

// Para mapear la clase numérica a un texto descriptivo.
var severityText = {
  0: 'Crecimiento/negativo',
  1: 'Sin quemar',
  2: 'Baja',
  3: 'Media',
  4: 'Alta',
  5: 'Muy alta'
};

// ********************************************Bloque 1: Configuración inicial del mapa *********************************//
var map = ui.Map();
ui.root.clear();
ui.root.add(map);
map.setCenter(-5.9, 43.3, 9); // Centramos el mapa en Asturias

// Cargar el contorno administrativo de Asturias desde FAO/GAUL/2015/level1
var asturias = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM1_NAME', 'Principado de Asturias'));

// Contorno de Asturias
var asturias = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM1_NAME', 'Principado de Asturias'));
var styledAsturias = asturias.style({
  color: '#000000',
  fillColor: '00000000',
  width: 1
});
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

// -- Paso 1: label
var step1Label = ui.Label('PASO 1: Dibujar ámbito de análisis.', {
  fontSize: '12px',
  fontWeight: 'bold',
  margin: '0 0 4px 0'
});

// -- Paso 2: Fechas
var step2Label = ui.Label('PASO 2: Seleccionar fechas de análisis.', {
  fontSize: '12px',
  fontWeight: 'bold',
  margin: '6px 0 4px 0'
});

// Caja de fecha inicio
var startDateInput = ui.Textbox({
  placeholder: 'YYYY-MM-DD',
  value: '2025-01-01',
  style: {width: '90px', fontSize: '11px'}
});

// Fecha hoy
var today = new Date();
var yyyy = today.getFullYear();
var mm = (today.getMonth() + 1);
var dd = today.getDate();
var dateStr = yyyy + '-' + pad(mm) + '-' + pad(dd);

// Caja de fecha fin
var endDateInput = ui.Textbox({
  placeholder: 'YYYY-MM-DD',
  value: dateStr,
  style: {width: '90px', fontSize: '11px'}
});

// Panel horizontal para Fechas (colocamos Inicio a la izq, Fin a la der)
var datesPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {margin: '2px 0 0 0'}
});
var startLabel = ui.Label('Inicio:', {fontSize: '11px', margin: '0 4px 0 0'});
var endLabel   = ui.Label('Fin:',    {fontSize: '11px', margin: '0 4px 0 12px'});
datesPanel.add(startLabel);
datesPanel.add(startDateInput);
datesPanel.add(endLabel);
datesPanel.add(endDateInput);

// -- Paso 3: año de comparación
var step3Label = ui.Label('PASO 3: Seleccionar año de comparación:', {
  fontSize: '12px',
  fontWeight: 'bold',
  margin: '6px 0 4px 0'
});

// Dropdown
var yearDropdown = ui.Select({
  items: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
  placeholder: 'Selecciona un año',
  value: '2025',
  style: {fontSize: '11px', width: '100%'}
});

// Botón de Analizar
var analyzeButton = ui.Button({
  label: 'Analizar',
  disabled: true,
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
  style: {
    width: '100%',
    textAlign: 'center',
    margin: '6px 0 4px 0',
    height: '24px',
    fontSize: '11px'
  }
});

// Panel principal donde irá todo
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

// ---Añadir bloques de resultados y gráfico

// Creamos contenedores donde pondremos resultados
var resultsPanel = ui.Panel({style: {margin: '10px 0 0 0'}});
controlPanel.add(resultsPanel);

// Creamos una variable global (o local) para almacenar
// un chart (diagrama de pastel) y luego actualizarlo
var severityChart = ui.Chart([], 'PieChart');
severityChart.setOptions({
  title: 'Distribución de Severidad',
  legend: { position: 'right' },
  pieHole: 0.4,       // 0 => pastel macizo, 0.4 => donut
  colors: ['blue','green','yellow','orange','red','brown']
});
resultsPanel.add(severityChart);

// Botón de "Descargar" => creará 4 tareas de exportación (NBR0, NBR1, dNBR, CLAS)
var downloadButton = ui.Button({
  label: 'Descargar',
  disabled: true,
  onClick: function() {
    // Verificamos que tengamos las imágenes para exportar
    if (!preNBRImageForExport || !postNBRImageForExport || 
        !diffNBRImageForExport || !severityImageForExport) {
      ui.alert('Alguna de las imágenes no está disponible. Realiza el análisis primero.');
      return;
    }
    if (!roi) {
      ui.alert('ROI nulo. Dibújalo de nuevo y analiza antes de exportar.');
      return;
    }
    
    // 1) Generar el timestamp actual => YYYYMMDD_HHmmss
    var now   = new Date();
    var Y     = now.getFullYear();
    var M     = pad(now.getMonth() + 1);
    var D     = pad(now.getDate());
    var hh    = pad(now.getHours());
    var mm2   = pad(now.getMinutes());
    var ss    = pad(now.getSeconds());
    var timeStamp = Y + M + D + '_' + hh + mm2 + ss;
    
    // 2) Recuperar fechas de inicio/fin
    var startDateVal = startDateInput.getValue(); // '2025-01-01' p.e.
    var endDateVal   = endDateInput.getValue();   // '2025-01-30'
    
    // Quitar guiones para formar YYYYMMDD
    var startNoDash = startDateVal.replace(/-/g, '');
    var endNoDash   = endDateVal.replace(/-/g, '');
    
    // 3) Construir el prefijo => timeStamp + "_I0_" + startNoDash + "_I1_" + endNoDash
    // Ej: "20250113_144500_I0_20250101_I1_20250130"
    var prefix = timeStamp + '_I0_' + startNoDash + '_I1_' + endNoDash;
    
    // 4) Lanza 4 tareas de exportación: Pre, Post, dNBR, Clas
    Export.image.toDrive({
      image: preNBRImageForExport,
      description: prefix + '_NBR0',
      folder: 'GEE_TEST',
      region: roi,
      scale: 10,
      maxPixels: 1e13
    });
    
    Export.image.toDrive({
      image: postNBRImageForExport,
      description: prefix + '_NBR1',
      folder: 'GEE_TEST',
      region: roi,
      scale: 10,
      maxPixels: 1e13
    });
    
    Export.image.toDrive({
      image: diffNBRImageForExport,
      description: prefix + '_dNBR',
      folder: 'GEE_TEST',
      region: roi,
      scale: 10,
      maxPixels: 1e13
    });
    
    Export.image.toDrive({
      image: severityImageForExport,
      description: prefix + '_CLAS',
      folder: 'GEE_TEST',
      region: roi,
      scale: 10,
      maxPixels: 1e13
    });
    
    ui.alert(
      'Se han creado 4 tareas de exportación.\n' +
      'Ve a la pestaña "Tasks" y pulsa "Run" en cada una para completar la descarga.'
    );
  }
});
controlPanel.add(downloadButton);

// Agregamos el panel a la interfaz principal
ui.root.widgets().add(controlPanel);


///************************************************************* Funcionalidad Principal************************************************* ///

// variable global para luego exportar
var severityImageForExport = null; 

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
    .select(['NBR']);
}

// Función de análisis de áreas quemadas
function analyzeBurnArea(roi, compareYear, startDate, endDate) {
  // Resetea mapa y panel
  Map.layers().reset(); 
  resultsPanel.clear();
  resultsPanel.add(severityChart);

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
  var diffNBR = postNBR.subtract(preNBR).rename('dNBR');

  // Clasificamos severidades según dNBR
  // Ajusta los umbrales a lo que te interese
  var severity = diffNBR.expression(
    'dNBR < -0.1 ? 0 ' +      // Crecimiento/negativo
    ': dNBR <  0.1 ? 1 ' +    // Sin quemar
    ': dNBR <  0.27 ? 2 ' +   // Baja
    ': dNBR <  0.44 ? 3 ' +   // Media
    ': dNBR <  0.66 ? 4 ' +   // Alta
    ': 5',                    // Muy alta
    {dNBR: diffNBR.select('dNBR')}
  ).rename('Severity').clip(roi); // agregar un clip de cálculo

  // Guardamos referencias para el botón de descarga
  preNBRImageForExport   = preNBR;
  postNBRImageForExport  = postNBR;
  diffNBRImageForExport  = diffNBR;
  severityImageForExport = severity;

  // Guardamos la severity para exportar en el botón
  severityImageForExport = severity;

  // Parámetros de visualización
  var visNBR = {
    min: -1,
    max: 1,
    palette: ['#7E1E9C', '#A737D2', '#D56EFF', '#E6B8FF', '#FFFFB3', '#B8E186', '#7DB736', '#4C9100'],
    opacity: 0.80
  };

  var visSev = {
    min: 0,
    max: 5,
    palette: ['blue','green','yellow','orange','red','brown'],
    opacity: 0.80
  };

  // Limpia capas existentes y añade las nuevas
  map.layers().reset();
  map.addLayer(preNBR,  visNBR, 'NBR Preincendio');
  map.addLayer(postNBR, visNBR, 'NBR Postincendio');
  map.addLayer(diffNBR, visNBR, 'dNBR');
  map.addLayer(severity, visSev, 'Severidad');

  // Calculamos áreas y porcentajes
  var areaImage = ee.Image.pixelArea();
  var severityInt = severity.toInt8();
  var classifiedArea = ee.Image.cat([areaImage.rename('area'), severityInt.rename('class')]);
  var stats = classifiedArea.reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'classValue'
    }),
    geometry: roi,
    scale: 10,
    maxPixels: 1e13
  });

  var groups = ee.List(stats.get('groups'));
  var totalAreaMeters = groups.map(function(item) {
    return ee.Dictionary(item).getNumber('sum');
  }).reduce(ee.Reducer.sum());

  var totalAreaha = ee.Number(totalAreaMeters).divide(10000); // Convertir a km²

  print('Área total (ha) en ROI:', totalAreaha);

  // Preparamos resultados para mostrar en panel
  // y para dibujar gráfico circular
  groups.evaluate(function(gList) {
    // Si no hay datos, mostramos aviso y salimos.
    if (!gList || gList.length === 0) {
      resultsPanel.add(ui.Label('No hay datos de severidad para mostrar.'));
      return;
    }
  
    // 1) Obtenemos área total (m²) como número en el cliente
    //    Pasamos m² a hectáreas => / 10000
    var totalAreaHaNum = ee.Number(totalAreaMeters).divide(10000).getInfo();
  
    // 2) Construimos los datos del gráfico de pastel:
    //    Formato:  [ ['Clase', 'Porcentaje'], ['Clase 0', 30], ... ]
    var chartData = [];
    chartData.push(['Clase', 'Porcentaje']);
  
    // También generaremos las líneas de texto que mostraremos debajo del gráfico
    var lines = [];
  
    for (var i = 0; i < gList.length; i++) {
      // Cada gList[i] es un diccionario con { classValue: X, sum: area_m2 }
      var dic = gList[i];
      // Convertimos a valor numérico en el cliente
      var classValNum  = ee.Number(dic.classValue).getInfo();  // clase
      var areaMeters   = ee.Number(dic.sum).getInfo();         // área en m²
      var areaHaNum    = areaMeters / 10000;                   // área en ha
      var percNum      = (areaMeters / (totalAreaHaNum * 10000)) * 100; 
      // OJO: totalAreaHaNum * 10000 => m² totales
  
      // Añadimos al array de datos para el pastel
      chartData.push(['Clase ' + classValNum, percNum]);
  
      // Preparamos la línea de texto para el resultsPanel
      // E.g.: "Clase 1: 123.45 ha (10.22%)"
      var textLine = 'Clase ' + classValNum + ': ' +
                     areaHaNum.toFixed(2) + ' ha (' +
                     percNum.toFixed(2) + '%)';
  
      lines.push(textLine);
    }
  
    // 3) Creamos el nuevo PieChart con datos ya numéricos
    var severityChartNew = ui.Chart(chartData, 'PieChart', {
      title: 'Distribución de Severidad',
      legend: { position: 'right' },
      pieHole: 0.4,  // dona
      colors: ['blue','green','yellow','orange','red','brown']
    });
  
    // 4) Limpiamos resultsPanel y metemos el chart primero
    resultsPanel.clear();
    resultsPanel.add(severityChartNew);
  
    // 5) Añadimos cada línea de texto (una por clase)
    lines.forEach(function(line) {
      resultsPanel.add(ui.Label(line));
    });
  
    // 6) Área total en ha (también numérica real)
    var totalText = 'Área total: ' + totalAreaHaNum.toFixed(2) + ' ha';
    resultsPanel.add(ui.Label(totalText));
  });
  

  // Activamos el botón de descarga (por si estaba desactivado antes)
  downloadButton.setDisabled(false);

}
