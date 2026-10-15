"""Pendientes de asistencia: genera un Excel por entidad y los empaqueta en un .zip.

Uso: python scripts/exportar_pendientes_todos.py scripts/exportar_pendientes_sindicato.py <carpeta_salida> <archivo.zip>
(los archivos traen datos personales: guardar fuera del repo y del vault)
"""
import subprocess, sys, re, zipfile, os, pathlib
GEN = sys.argv[1]; OUT = pathlib.Path(sys.argv[2]); ZIP = sys.argv[3]
ENTS = {  # entidad en BD (| = variantes que se unen) -> nombre del archivo
 "SSC":"SSC","ASIES":"ASIES","ASIT|ASIT-ASOCIACION SINDICAL DE TRABAJADORES DE SALUD":"ASIT","SINTRAUNPROS":"SINTRAUNPROS",
 "SINTRASALUD":"SINTRASALUD","SINTRAS":"SINTRAS","HSLV":"HSLV","SOLSEAA":"SOLSEAA","ASOMED":"ASOMED","SINDESCA":"SINDESCA",
 "ASANESCA":"ASANESCA","HEIMDALL SECURITY LTDA":"Heimdall Security Ltda","INTEGRAL SALUD DE COLOMBIA SAS":"Integral Salud de Colombia SAS",
 "SMP EN SALUD DEL CAUCA":"SMP en Salud del Cauca","GESTION TECNOLOGICA EN SALUD SAS":"Gestion Tecnologica en Salud SAS",
 "ARX DIAGNOSTICO":"ARX Diagnostico","GASTROCENTER":"Gastrocenter","CORAZON Y AORTA SAS":"Corazon y Aorta SAS","VHR":"VHR",
 "CLINIREUMA SAS":"Clinireuma SAS","CIRUGIA LAPAROSCOPICA DEL CAUCA - CLC":"Cirugia Laparoscopica del Cauca - CLC",
 "OTORRINOS DEL CAUCA":"Otorrinos del Cauca","CIRUGIA VASCULAR Y CARDIO NEURO ENDOVASCULAR":"Cirugia Vascular y Cardio Neuro Endovascular",
 "GRUPO OFTALOLOGICO DEL CAUCA SAS":"Grupo Oftalologico del Cauca SAS","ALL AMERICA CLINIC SAS":"All America Clinic SAS","CIVACNE":"CIVACNE",
 "CM CIRUGIA PERCUTANEA SAS":"CM Cirugia Percutanea SAS",
 "ME&NTEGRAL DE COLOMBIA S.A.S|MEINTEGRAL":"ME Integral de Colombia SAS","GUARDA":"GUARDA"}
OUT.mkdir(parents=True, exist_ok=True)
for k, nombre in ENTS.items():
    f = OUT / f"{nombre} Induccion2026 - Pendientes.xlsx"
    r = subprocess.run([sys.executable, GEN, k, str(f)], capture_output=True, text=True, encoding="utf8")
    print(nombre, "->", (r.stdout.splitlines() or [r.stderr[-200:]])[0])
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.glob("*.xlsx")): z.write(f, f.name)
print(len(list(OUT.glob("*.xlsx"))), "archivos en", ZIP)
