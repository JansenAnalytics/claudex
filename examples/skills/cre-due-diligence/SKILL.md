---
description: "cd ~/projects/cre-due-diligence"
name: cre-due-diligence
triggers:
  - property analysis
  - due diligence
  - eiendom
  - building permit
  - rammetillatelse
  - property valuation
  - CRE
  - commercial real estate
  - company lookup
  - brønnøysund
  - kartverket
---

# CRE Due Diligence System

## Quick Start

```bash
cd ~/projects/cre-due-diligence

# Full analysis from address
python3 src/cli.py analyze "Michelets vei 62, Stabekk" --owner "Baptistenes Eiendomsdrift"

# Company lookup
python3 src/cli.py company --orgnr 971522046
python3 src/cli.py company --name "Olav Thon"

# Generate reports
python3 src/cli.py report --id 1 --format full          # PDF
python3 src/cli.py report --id 1 --format quick          # Quick memo PDF
python3 src/cli.py report --id 1 --format telegram       # Telegram summary
python3 src/cli.py report --id 1 --format request-list   # Sendable DD list

# View risks
python3 src/cli.py risks --id 1

# Environmental scan
python3 src/cli.py environment --lat 59.903 --lon 10.605

# SSB market data
python3 src/cli.py market --municipality 3201
python3 src/cli.py market --search "næringseiendom"

# List properties
python3 src/cli.py properties
```

## Architecture

### Registry Clients (`src/registry/`)
- `property.py` — Geonorge address → gnr/bnr, Kartverket matrikkel WFS
- `company.py` — Brønnøysund: entities, roles, financials, ownership chains
- `ssb_mcp.py` — SSB via MCP server: property transactions, construction costs, population
- `statistics.py` — Direct SSB API fallback
- `environment.py` — NVE (flood/landslide/quick clay), NGU (radon), Miljødir (contamination), Riksantikvaren (heritage)

### Analysis (`src/analysis/`)
- `risk_matrix.py` — 12-category automated risk scoring (5×5 matrix)
- `permit_analyzer.py` — Permit expiry, TEK version, feasibility, development timelines
- `dd_request_list.py` — Templated request lists (standard + development + lease audit)

### Valuation (`src/valuation/`)
- `engine.py` — Income (direct cap + DCF), Comparable, Cost (replacement + residual), Monte Carlo

### Reports (`src/reports/`)
- `generate.py` — Full DD report, quick memo, Telegram summary, request list → PDF via latex-doc

### Database
- SQLite at `~/projects/cre-due-diligence/data/cre.db`
- 15 tables: properties, companies, risks, valuations, dd_items, hazards, permits, leases, etc.

## SSB MCP Server
Configured via mcporter: `ssb-mcp` — key tables for CRE:
- 08949: Property sales by type (quarterly)
- 08651: Construction cost index
- 07459: Population
- 09747: Rental price index

## Key Norwegian APIs (all free)
- Geonorge Adresser: `ws.geonorge.no/adresser/v1/`
- Brønnøysund: `data.brreg.no/enhetsregisteret/api/`
- NVE Atlas: `gis3.nve.no/map/rest/services/`
- NGU: `geo.ngu.no/`

## Repo
`~/projects/cre-due-diligence` → https://github.com/janseninvest/cre-due-diligence (private)
