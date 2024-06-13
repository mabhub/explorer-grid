#!/usr/bin/env node

import fs from 'fs/promises';
import { bbox, combine, feature, featureCollection } from '@turf/turf';
import { Command } from 'commander';
import { DOMParser } from 'xmldom';
import mime from 'mime';
import * as togeojson from '@tmcw/togeojson';
import tokml from 'tokml';

function tile2long (x, z = 14) {
  return (x / Math.pow(2, z) * 360 - 180);
}
function tile2lat (y, z = 14) {
  var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}
function lon2tile (x, z = 14) {
  return (Math.floor((x + 180) / 360 * Math.pow(2, z)));
}
function lat2tile (y, z = 14) {
  return (Math.floor((1 - Math.log(Math.tan(y * Math.PI / 180) + 1 / Math.cos(y * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)));
}

const program = new Command();
program.parse(process.argv);

const routes = [];

for await (const input of program.args) {
  const mimeType = mime.getType(input);
  if (mimeType === 'application/gpx+xml') {
    const file = await fs.readFile(input);
    const geojson = togeojson.gpx(new DOMParser().parseFromString(file.toString()));
    routes.push(...geojson.features)
  }
}

routes.filter(feature => feature.hasOwnProperty('properties')).forEach(feature => feature.properties =  { 'stroke-width': 10, 'stroke-opacity': 0.5, stroke: '#4264fb' });
const routeCollection = featureCollection(routes);

const [minX, minY, maxX, maxY] = bbox(routeCollection);

const X = { from: lon2tile(minX) - 1, to: lon2tile(maxX) + 1 };
const Y = { from: lat2tile(maxY) - 1, to: lat2tile(minY) + 1 };

const features = [];

for (let x = X.from; x <= X.to; x++) {
  features.push(feature({
    type: 'LineString',
    coordinates: [
      [tile2long(x), tile2lat(Y.from)],
      [tile2long(x), tile2lat(Y.to)]
    ],
  }));
}

for (let y = Y.from; y <= Y.to; y++) {
  features.push(feature({
    type: 'LineString',
    coordinates: [
      [tile2long(X.from), tile2lat(y)],
      [tile2long(X.to), tile2lat(y)]
    ],
  }));
}

const grid = combine(featureCollection(features));
if (grid.features?.at(0)?.properties) {
  grid.features.at(0).properties = { 'stroke-width': 1, stroke: '#ff0000' };
}

const collection = featureCollection([...grid.features, ...routes]);

process.stdout.write(tokml(collection, { simplestyle: true }) + '\n');
