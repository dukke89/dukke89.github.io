import csv
import re

def clean(s):
    return s.encode('utf-8', 'ignore').decode('utf-8').lstrip('\ufeff').strip()

def parse_csv(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.reader(f, delimiter=';')
        rows = list(reader)
        if not rows: return []
        headers = [clean(h).upper() for h in rows[0]]
        result = []
        for r in rows[1:]:
            row_dict = {}
            for i, h in enumerate(headers):
                if i < len(r):
                    row_dict[h] = clean(r[i])
            result.append(row_dict)
        return result, headers

def check():
    cumplimiento, cum_headers = parse_csv('CUMPLIMIENTO_2025.csv')
    demoras, dem_headers = parse_csv('DEMORAS.csv')

    dem_cliente_col = [c for c in ["CLIENTE", "CLIENTE / OBRA", "CLIENTE NRO.", "OBRA"] if c in dem_headers][0]
    cum_cliente_col = [c for c in ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"] if c in cum_headers][0]

    dem_clasif_col = [c for c in ["CARACTER DE GC", "CARÁCTER DE GC", "CARACTER GC"] if c in dem_headers][0]
    cum_clasif_col = [c for c in ["CLASIFICACION 2", "CLASIFICACIÓN 2", "CLASIFICACION2", "CLASIFICACION_2"] if c in cum_headers][0]

    # Filter Obra 314
    dem_obra = [d for d in demoras if d.get(dem_cliente_col, '').strip() == "00314 CASA Olavarría"]
    cum_obra = [c for c in cumplimiento if c.get(cum_cliente_col, '').strip() == "00314 CASA Olavarría"]

    def to_num(v):
        try: return float(v.replace('.','').replace(',','.'))
        except: return 0.0

    print("=== DEMORAS (Count per classification) ===")
    dem_counts = {}
    for d in dem_obra:
        c = d.get(dem_clasif_col, '').strip().upper()
        dem_counts[c] = dem_counts.get(c, 0) + 1
    
    for k, v in sorted(dem_counts.items()):
        print(f"  {k}: {v}")
        
    print(f"Total Demoras: {sum(dem_counts.values())}")
    
    # Calculate without 'EQUIPOS'
    sin_eq = sum(v for k,v in dem_counts.items() if k != 'EQUIPOS')
    print(f"Demoras sin EQUIPOS: {sin_eq}")

    print("\n=== CUMPLIMIENTO (FT Sum per classification) ===")
    cum_counts = {}
    for c in cum_obra:
        cl = c.get(cum_clasif_col, '').strip().upper()
        ft = to_num(c.get('ENTREGADOS FT', '0'))
        cum_counts[cl] = cum_counts.get(cl, 0) + ft
        
    for k, v in sorted(cum_counts.items()):
        print(f"  {k}: {v}")
        
    print(f"Total Cumplimiento FT: {sum(cum_counts.values())}")

    # Calculate exactly 372
    # The user says "sin compras equipos tengo 372"
    # Let's see all combinations that sum to exactly 372 or similar
    sin_ce = sum(v for k,v in cum_counts.items() if k != 'COMPRAS EQUIPOS' and k != 'EQUIPOS')
    print(f"Cumplimiento FT sin (COMPRAS EQUIPOS / EQUIPOS): {sin_ce}")
    print(f"Cumplimiento FT sin (COMPRAS EQUIPOS): {sum(v for k,v in cum_counts.items() if k != 'COMPRAS EQUIPOS')}")

check()
