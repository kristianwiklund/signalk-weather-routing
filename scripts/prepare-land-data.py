#!/usr/bin/env python3
"""
Offline build script: download GSHHG shapefile, build land edge index and
dilated edge index, write compressed binary files to data/.

Run: python3 scripts/prepare-land-data.py

Outputs:
  data/edge-index.bin.gz          -- land edge index (all L1 polygons)
  data/dilated-edge-index.bin.gz  -- same polygons dilated by DILATION_RADIUS_NM

Requirements: pip3 install shapely fiona
"""

import gzip
import io
import math
import os
import struct
import sys
import zipfile
import urllib.request

import fiona
from shapely.geometry import shape, Polygon as ShapelyPolygon
from shapely.ops import unary_union
import numpy as np

# Resolution tier: c=crude, l=low, i=intermediate, h=high, f=full
# h gives ~7 km detail, matching the ICON-EU 7 km weather grid
GSHHG_RESOLUTION = 'h'

DILATION_RADIUS_NM = 0.5

GSHHG_VERSION  = '2.3.7'
GSHHG_FILENAME = f'gshhg-shp-{GSHHG_VERSION}.zip'
GSHHG_URL      = f'https://www.soest.hawaii.edu/pwessel/gshhg/gshhg-shp-{GSHHG_VERSION}.zip'

EDGE_INDEX_MAGIC      = 0x4C4E4458  # 'LNDX'
EDGE_INDEX_VERSION    = 2
DILATED_INDEX_MAGIC   = 0x444C4E44  # 'DLND'
DILATED_INDEX_VERSION = 2

EDGE_CELL_DEG = 0.1

DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_file(url, dest):
    last_pct = [-1]

    def report(count, block_size, total_size):
        if total_size <= 0:
            return
        pct = min(100, count * block_size * 100 // total_size)
        if pct % 5 == 0 and pct != last_pct[0]:
            downloaded = min(count * block_size, total_size)
            print(f'\r  Downloading... {pct}% ({downloaded/1e6:.1f} / {total_size/1e6:.1f} MB)',
                  end='', flush=True)
            last_pct[0] = pct

    urllib.request.urlretrieve(url, dest, reporthook=report)
    print(flush=True)


# ---------------------------------------------------------------------------
# Polygon loading
# ---------------------------------------------------------------------------

def _polygon_to_dict(geom):
    coords = list(geom.exterior.coords)  # [(lon, lat), ...] including closing vertex
    if len(coords) < 4:
        return None
    flat = [v for pt in coords for v in pt]  # [lon0, lat0, lon1, lat1, ...]
    lons = [pt[0] for pt in coords]
    lats = [pt[1] for pt in coords]
    return {
        'lat_min': min(lats),
        'lat_max': max(lats),
        'lon_min': min(lons),
        'lon_max': max(lons),
        'coords': flat,
    }


def load_polygons(zip_path, resolution):
    log(f'\n[2/5] Extracting shapefile for resolution="{resolution}"...')
    tmp_dir = os.path.join(DATA_DIR, '_tmp_shp')
    os.makedirs(tmp_dir, exist_ok=True)

    prefix = f'GSHHS_shp/{resolution}/GSHHS_{resolution}_L1'
    with zipfile.ZipFile(zip_path) as zf:
        for ext in ('shp', 'dbf', 'shx'):
            entry = f'{prefix}.{ext}'
            dest  = os.path.join(tmp_dir, f'GSHHS_{resolution}_L1.{ext}')
            with zf.open(entry) as src, open(dest, 'wb') as dst:
                dst.write(src.read())

    shp_path = os.path.join(tmp_dir, f'GSHHS_{resolution}_L1.shp')
    log('[3/5] Loading polygons from shapefile...')

    polygons = []
    with fiona.open(shp_path) as src:
        total = len(src)
        log(f'  Found {total:,} features')
        last_pct = -1
        for i, feature in enumerate(src):
            geom = shape(feature['geometry'])
            if geom.geom_type == 'Polygon':
                p = _polygon_to_dict(geom)
                if p:
                    polygons.append(p)
            elif geom.geom_type == 'MultiPolygon':
                for part in geom.geoms:
                    p = _polygon_to_dict(part)
                    if p:
                        polygons.append(p)
            pct = (i + 1) * 100 // total
            if pct != last_pct and pct % 10 == 0:
                print(f'\r  Loaded {i+1:,} / {total:,} ({pct}%)', end='', flush=True)
                last_pct = pct
    print(flush=True)

    import shutil
    shutil.rmtree(tmp_dir, ignore_errors=True)

    log(f'  Loaded {len(polygons):,} polygons')
    return polygons


# ---------------------------------------------------------------------------
# Edge index building (port of buildLandEdgeIndex from src/lib/landmask.ts)
# ---------------------------------------------------------------------------

def _edge_cell_key(lat_cell, lon_cell):
    return (lat_cell + 900) * 3600 + ((lon_cell % 3600) + 3600) % 3600


def _insert_edge_into_cells(accum, lat1, lon1, lat2, lon2, pi, ei):
    D = EDGE_CELL_DEG
    lat_cell = math.floor(lat1 / D)
    lon_cell = math.floor(lon1 / D)
    lat_end  = math.floor(lat2 / D)
    lon_end  = math.floor(lon2 / D)

    def push(la, lo):
        key = _edge_cell_key(la, lo)
        cell = accum.get(key)
        if cell is None:
            accum[key] = [pi, ei]
        else:
            cell.append(pi)
            cell.append(ei)

    push(lat_cell, lon_cell)
    if lat_cell == lat_end and lon_cell == lon_end:
        return

    d_lat = lat2 - lat1
    d_lon = lon2 - lon1
    s_lat = 1 if d_lat > 0 else (-1 if d_lat < 0 else 0)
    s_lon = 1 if d_lon > 0 else (-1 if d_lon < 0 else 0)
    t_d_lat = abs(D / d_lat) if s_lat != 0 else math.inf
    t_d_lon = abs(D / d_lon) if s_lon != 0 else math.inf

    if s_lat > 0:
        t_m_lat = ((lat_cell + 1) * D - lat1) / d_lat
    elif s_lat < 0:
        t_m_lat = (lat_cell * D - lat1) / d_lat
    else:
        t_m_lat = math.inf

    if s_lon > 0:
        t_m_lon = ((lon_cell + 1) * D - lon1) / d_lon
    elif s_lon < 0:
        t_m_lon = (lon_cell * D - lon1) / d_lon
    else:
        t_m_lon = math.inf

    max_steps = abs(lat_end - lat_cell) + abs(lon_end - lon_cell)
    for _ in range(max_steps):
        if t_m_lat < t_m_lon:
            t_m_lat += t_d_lat
            lat_cell += s_lat
        else:
            t_m_lon += t_d_lon
            lon_cell += s_lon
        push(lat_cell, lon_cell)
        if lat_cell == lat_end and lon_cell == lon_end:
            break


def build_edge_index(polygons):
    edge_accum = {}  # cell_key -> [pi, ei, pi, ei, ...]
    poly_grid  = {}  # cell_key -> [pi, ...]

    for pi, poly in enumerate(polygons):
        coords = poly['coords']
        nv = len(coords) // 2

        # 1° polygon grid
        lat_lo = math.floor(poly['lat_min'])
        lat_hi = math.floor(poly['lat_max'])
        lon_lo = math.floor(poly['lon_min'])
        lon_hi = math.floor(poly['lon_max'])
        for la in range(lat_lo, lat_hi + 1):
            for lo in range(lon_lo, lon_hi + 1):
                key = (la + 90) * 360 + (lo + 180)
                cell = poly_grid.get(key)
                if cell is None:
                    poly_grid[key] = [pi]
                else:
                    cell.append(pi)

        # 0.1° edge grid
        for ei in range(nv):
            lon1 = coords[ei * 2]
            lat1 = coords[ei * 2 + 1]
            ni   = ei + 1 if ei + 1 < nv else 0
            lon2 = coords[ni * 2]
            lat2 = coords[ni * 2 + 1]
            _insert_edge_into_cells(edge_accum, lat1, lon1, lat2, lon2, pi, ei)

    return edge_accum, poly_grid


# ---------------------------------------------------------------------------
# Binary serialization (must match parseIndexBuffer in src/lib/setup.ts)
#
# Header (32 bytes):
#   magic     u32LE   version  u32LE   zero    i64LE
#   nPolygons u32LE   nEdge    u32LE   nPoly   u32LE   pad u32LE
#
# Per polygon:
#   bboxLatMin..bboxLonMax  4 × f64BE
#   nFloats u32LE  pad u32LE
#   exterior  nFloats × f64LE
#
# Per edge/poly grid cell:
#   key u32LE  n u32LE  entries n × u32LE
# ---------------------------------------------------------------------------

def serialize_index(polygons, edge_accum, poly_grid, magic, version):
    buf = io.BytesIO()

    buf.write(struct.pack('<II', magic, version))
    buf.write(struct.pack('<q', 0))
    buf.write(struct.pack('<IIII', len(polygons), len(edge_accum), len(poly_grid), 0))

    for poly in polygons:
        coords   = poly['coords']
        n_floats = len(coords)
        buf.write(struct.pack('>dddd',
            poly['lat_min'], poly['lat_max'], poly['lon_min'], poly['lon_max']))
        buf.write(struct.pack('<II', n_floats, 0))
        buf.write(np.array(coords, dtype='<f8').tobytes())

    for key, entries in edge_accum.items():
        n = len(entries)
        buf.write(struct.pack('<II', key, n))
        buf.write(np.array(entries, dtype='<u4').tobytes())

    for key, indices in poly_grid.items():
        n = len(indices)
        buf.write(struct.pack('<II', key, n))
        buf.write(np.array(indices, dtype='<u4').tobytes())

    return buf.getvalue()


# ---------------------------------------------------------------------------
# Dilation
# ---------------------------------------------------------------------------

def _flatten_geometry(geom, out):
    if geom.geom_type == 'Polygon':
        p = _polygon_to_dict(geom)
        if p:
            out.append(p)
    elif geom.geom_type in ('MultiPolygon', 'GeometryCollection'):
        for g in geom.geoms:
            _flatten_geometry(g, out)


def dilate_polygons(polygons):
    radius_deg = DILATION_RADIUS_NM / 60.0
    log(f'\n[5/5] Dilating {len(polygons):,} polygons by {DILATION_RADIUS_NM} NM ({radius_deg:.6f}°)...')

    buffered = []
    last_pct = -1
    total    = len(polygons)

    for i, poly in enumerate(polygons):
        coords = poly['coords']
        pairs  = list(zip(coords[0::2], coords[1::2]))
        geom   = ShapelyPolygon(pairs)
        if geom.is_valid and not geom.is_empty:
            b = geom.buffer(radius_deg)
            if not b.is_empty:
                buffered.append(b)

        pct = (i + 1) * 100 // total
        if pct != last_pct:
            print(f'\r  Buffering... {pct}% ({i+1:,} / {total:,})', end='', flush=True)
            last_pct = pct

    print(flush=True)
    log(f'  Running union on {len(buffered):,} buffered geometries (may take several minutes)...')

    union = unary_union(buffered)

    log('  Flattening result...')
    result = []
    _flatten_geometry(union, result)
    log(f'  {len(result):,} merged polygons')
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # Step 1: Download
    zip_path = os.path.join(DATA_DIR, GSHHG_FILENAME)
    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 1_000_000:
        log(f'[1/5] {GSHHG_FILENAME} already present, skipping download')
    else:
        log(f'[1/5] Downloading {GSHHG_FILENAME}...')
        log(f'  URL: {GSHHG_URL}')
        if os.path.exists(zip_path):
            os.remove(zip_path)
        download_file(GSHHG_URL, zip_path)
        log('  Download complete')

    # Steps 2–3: Extract and load polygons
    polygons = load_polygons(zip_path, GSHHG_RESOLUTION)

    # Step 4: Build and save edge index
    log(f'\n[4/5] Building land edge index ({len(polygons):,} polygons)...')
    edge_accum, poly_grid = build_edge_index(polygons)
    log(f'  Edge cells: {len(edge_accum):,},  poly cells: {len(poly_grid):,}')
    raw      = serialize_index(polygons, edge_accum, poly_grid, EDGE_INDEX_MAGIC, EDGE_INDEX_VERSION)
    out_path = os.path.join(DATA_DIR, 'edge-index.bin.gz')
    with gzip.open(out_path, 'wb', compresslevel=9) as f:
        f.write(raw)
    log(f'  Saved {out_path}  ({len(raw)/1e6:.1f} MB raw → {os.path.getsize(out_path)/1e6:.1f} MB gzipped)')

    # Step 5: Dilate and save dilated edge index
    dilated = dilate_polygons(polygons)

    log(f'  Building dilated edge index ({len(dilated):,} polygons)...')
    dil_edge, dil_poly = build_edge_index(dilated)
    log(f'  Edge cells: {len(dil_edge):,},  poly cells: {len(dil_poly):,}')
    dil_raw  = serialize_index(dilated, dil_edge, dil_poly, DILATED_INDEX_MAGIC, DILATED_INDEX_VERSION)
    dil_path = os.path.join(DATA_DIR, 'dilated-edge-index.bin.gz')
    with gzip.open(dil_path, 'wb', compresslevel=9) as f:
        f.write(dil_raw)
    log(f'  Saved {dil_path}  ({len(dil_raw)/1e6:.1f} MB raw → {os.path.getsize(dil_path)/1e6:.1f} MB gzipped)')

    log('\nDone. Commit data/edge-index.bin.gz and data/dilated-edge-index.bin.gz to the repository.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nInterrupted.', flush=True)
        sys.exit(1)
    except Exception as e:
        print(f'\nprepare-land-data failed: {e}', file=sys.stderr, flush=True)
        sys.exit(1)
