from pathlib import Path
root=Path(__file__).resolve().parent
html=(root/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+ (root/'style.css').read_text()+'</style>')
html=html.replace('<script src="app.js"></script>','<script>'+ (root/'app.js').read_text()+'</script>')
out=root/'dist'
out.mkdir(exist_ok=True)
output=out/'课桌-本地原型.html'
output.write_text(html)
print(output)
