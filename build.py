from pathlib import Path
root=Path(__file__).resolve().parent
html=(root/'index.html').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+ (root/'style.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<script src="core.js"></script>','<script>'+ (root/'core.js').read_text(encoding='utf-8')+'</script>')
html=html.replace('<script src="radar.js"></script>','<script>'+ (root/'radar.js').read_text(encoding='utf-8')+'</script>')
html=html.replace('<script src="app.js"></script>','<script>'+ (root/'app.js').read_text(encoding='utf-8')+'</script>')
html=html.replace('<script src="pta.js"></script>','<script>'+ (root/'pta.js').read_text(encoding='utf-8')+'</script>')
out=root/'dist'
out.mkdir(exist_ok=True)
output=out/'课桌-本地原型.html'
output.write_text(html, encoding='utf-8')
print(output)
