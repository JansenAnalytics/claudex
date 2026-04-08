---
name: visualize
description: "Generate charts and visualizations: line, bar, scatter, heatmap, candlestick. Output as PNG/SVG for Telegram or web."
---

# visualize

Generate charts and visualizations: line, bar, scatter, heatmap, candlestick. Output as PNG/SVG for Telegram or web.

## When to Use

- Creating charts from CSV/JSON data
- Visualizing trends and time series
- Generating report graphics
- Plotting comparisons (bar, grouped bar)
- Creating candlestick/OHLC charts for financial data
- Quick one-off plots from data files

## Scripts

| Script           | Purpose                       | Usage                                                                   |
| ---------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `chart.py`       | Full-featured chart generator | `python3 chart.py data.csv --type line --x date --y price -o chart.png` |
| `quick-plot.py`  | Minimal CSV → PNG             | `python3 quick-plot.py data.csv bar -o plot.png`                        |
| `candlestick.py` | OHLC/candlestick charts       | `python3 candlestick.py ohlc.csv -o candle.png`                         |

## Examples

```bash
# Line chart
python3 scripts/chart.py sales.csv --type line --x month --y revenue -o revenue.png

# Bar chart with title
python3 scripts/chart.py data.csv --type bar --x category --y count --title "Items by Category" -o items.png

# Quick scatter plot
python3 scripts/quick-plot.py measurements.csv scatter -o scatter.png

# Candlestick
python3 scripts/candlestick.py btc_daily.csv --title "BTC/USD" -o btc.png

# Multiple Y columns
python3 scripts/chart.py data.csv --type line --x date --y "col1,col2" -o multi.png
```

## References

- `references/chart-guide.md` — Which chart type for which data
- `references/color-palettes.md` — Color schemes
- `references/recipes.md` — Common chart recipes

## Dependencies

- Python 3
- matplotlib (`sudo apt install python3-matplotlib` or `pip3 install matplotlib`)
