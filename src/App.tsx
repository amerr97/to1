/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, RotateCcw, Save, Download, Info, Menu, X, Home, Calculator, Upload, FileText, ShieldCheck, Share2, FileDown, Briefcase, Calendar, BookOpen, ChevronRight, ChevronLeft, MoreVertical } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// --- Types ---

interface RowData {
  id: string;
  station: string;    // A
  point: string;      // B (optional, for reference)
  distance1: string;  // New: Duzina I
  distance2: string;  // New: Duzina II
  face1: string;      // C (I) - DD-MM-SS
  face2: string;      // D (II) - DD-MM-SS
  collimation: string; // E (2C) - Seconds
  mean: string;        // F (Sredina) - DD-MM-SS
  reducedMean: string; // G (Redukovana sredina) - DD-MM-SS
}

interface Job {
  id: string;
  name: string;
  date: string;
  rows: RowData[];
}

// --- Utility Functions (Ported from Apps Script) ---

const mod360 = (x: number): number => ((x % 360) + 360) % 360;

const pad2 = (n: number): string => String(n).padStart(2, "0");

const parseDMS = (txt: string): number => {
  const cleanTxt = String(txt).trim().replace(/\s+/g, "");
  if (!cleanTxt) return NaN;

  const parts = cleanTxt.split("-");
  if (parts.length !== 3) return NaN;

  const d = Number(parts[0]);
  const m = Number(parts[1]);
  const s = Number(parts[2]);

  if (isNaN(d) || isNaN(m) || isNaN(s)) return NaN;

  return d + m / 60 + s / 3600;
};

const decimalToDMS = (x: number): string => {
  if (isNaN(x)) return "";
  x = mod360(x);

  let d = Math.floor(x);
  let mFloat = (x - d) * 60;
  let m = Math.floor(mFloat);
  let sFloat = (mFloat - m) * 60;
  let s = Math.round(sFloat);

  if (s === 60) {
    s = 0;
    m += 1;
  }

  if (m === 60) {
    m = 0;
    d += 1;
  }

  if (d === 360) d = 0;

  return `${pad2(d)}-${pad2(m)}-${pad2(s)}`;
};

const secondsOnly = (deg: number): string => {
  if (isNaN(deg)) return "";
  const sec = Math.round(deg * 3600);
  return sec.toString();
};

const getRawSecondsSum = (dmsStrings: string[]): number => {
  let totalSeconds = 0;
  let hasValue = false;
  dmsStrings.forEach(txt => {
    const val = parseDMS(txt);
    if (!isNaN(val)) {
      totalSeconds += Math.round(val * 3600);
      hasValue = true;
    }
  });
  return hasValue ? totalSeconds : 0;
};

const formatSecondsToDMS = (totalSeconds: number): string => {
  if (isNaN(totalSeconds)) return "";
  const absSec = Math.round(Math.abs(totalSeconds));
  const m = Math.floor((absSec % 3600) / 60);
  const s = absSec % 60;
  return `${pad2(m)}' ${pad2(s)}"`;
};

const GRID_LAYOUT_CONTROLS = "minmax(0, 0.5fr) minmax(0, 0.5fr) minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 1.2fr)";
const GRID_LAYOUT_HOME = "minmax(0, 0.5fr) minmax(0, 0.5fr) minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 1.2fr) 40px";

// --- Main Component ---

export default function App() {
  const [rows, setRows] = useState<RowData[]>([
    { id: '1', station: 'S1', point: 'P1', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' },
    { id: '2', station: '', point: 'P2', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' },
  ]);
  const [activeTab, setActiveTab] = useState<'home' | 'girus' | 'reduced' | 'controls' | 'export' | 'instructions' | 'jobs' | 'import'>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Job Management State
  const [jobs, setJobs] = useState<Job[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [newJobName, setNewJobName] = useState('');

  // Initial Load from LocalStorage
  useEffect(() => {
    const savedJobs = localStorage.getItem('trig_jobs');
    const savedCurrentJobId = localStorage.getItem('trig_current_job_id');
    const savedRows = localStorage.getItem('trig_current_rows');
    
    if (savedJobs) {
      setJobs(JSON.parse(savedJobs));
    }
    
    if (savedCurrentJobId && savedJobs) {
      const parsedJobs = JSON.parse(savedJobs);
      const currentJob = parsedJobs.find((j: Job) => j.id === savedCurrentJobId);
      if (currentJob) {
        setCurrentJobId(savedCurrentJobId);
        setRows(currentJob.rows);
      } else if (savedRows) {
        setRows(JSON.parse(savedRows));
      }
    } else if (savedRows) {
      setRows(JSON.parse(savedRows));
    }
  }, []);

  // Auto-save to LocalStorage whenever jobs, currentJobId or rows change
  useEffect(() => {
    localStorage.setItem('trig_jobs', JSON.stringify(jobs));
    localStorage.setItem('trig_current_rows', JSON.stringify(rows));
    if (currentJobId) {
      localStorage.setItem('trig_current_job_id', currentJobId);
    } else {
      localStorage.removeItem('trig_current_job_id');
    }
  }, [jobs, currentJobId, rows]);

  // Sync current rows to the active job in the jobs list
  useEffect(() => {
    if (currentJobId) {
      setJobs(prevJobs => prevJobs.map(job => 
        job.id === currentJobId ? { ...job, rows: rows } : job
      ));
    }
  }, [rows]);

  const createNewJob = () => {
    if (!newJobName.trim()) {
      alert("Unesite naziv posla.");
      return;
    }
    const newJob: Job = {
      id: Date.now().toString(),
      name: newJobName.trim(),
      date: new Date().toLocaleString('bs-BA'),
      rows: [
        { id: '1', station: 'S1', point: 'P1', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' },
        { id: '2', station: '', point: 'P2', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' },
      ]
    };
    setJobs(prev => [...prev, newJob]);
    setCurrentJobId(newJob.id);
    setRows(newJob.rows);
    setNewJobName('');
    setActiveTab('home');
  };

  const selectJob = (id: string) => {
    const job = jobs.find(j => j.id === id);
    if (job) {
      setCurrentJobId(id);
      setRows(job.rows);
      setActiveTab('home');
    }
  };

  const deleteJob = (id: string) => {
    if (window.confirm("Da li ste sigurni da želite obrisati ovaj posao?")) {
      setJobs(prev => prev.filter(j => j.id !== id));
      if (currentJobId === id) {
        setCurrentJobId(null);
        setRows([
          { id: '1', station: 'S1', point: 'P1', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' },
          { id: '2', station: '', point: 'P2', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' },
        ]);
      }
    }
  };

  const reducedRows = useMemo(() => {
    let currentStation = "";
    return rows.map(row => {
      const isStart = row.station.trim() !== '';
      if (isStart) currentStation = row.station.trim();
      return { ...row, displayStation: currentStation, isStationStart: isStart };
    }).filter(row => row.reducedMean.trim() !== '');
  }, [rows]);

  const girusMeans = useMemo(() => {
    const stationMap = new Map<string, Map<string, { angles: number[], distances: number[] }>>();
    let currentStation = "";

    rows.forEach(row => {
      if (row.station.trim()) {
        currentStation = row.station.trim();
      }
      
      const point = row.point.trim();
      const reducedMean = row.reducedMean;
      
      if (currentStation && point && reducedMean) {
        const reducedMeanDeg = parseDMS(reducedMean);
        if (!isNaN(reducedMeanDeg)) {
          if (!stationMap.get(currentStation)) {
            stationMap.set(currentStation, new Map<string, { angles: number[], distances: number[] }>());
          }
          const pointMap = stationMap.get(currentStation)!;
          if (!pointMap.get(point)) {
            pointMap.set(point, { angles: [], distances: [] });
          }
          
          pointMap.get(point)!.angles.push(reducedMeanDeg);
          
          // Calculate row distance average
          const d1 = parseFloat(row.distance1);
          const d2 = parseFloat(row.distance2);
          if (!isNaN(d1) && !isNaN(d2)) {
            pointMap.get(point)!.distances.push((d1 + d2) / 2);
          } else if (!isNaN(d1)) {
            pointMap.get(point)!.distances.push(d1);
          } else if (!isNaN(d2)) {
            pointMap.get(point)!.distances.push(d2);
          }
        }
      }
    });

    const results: { station: string; point: string; mean: string; meanDecimal: number; distance: string; count: number }[] = [];
    stationMap.forEach((pointMap, station) => {
      pointMap.forEach((data, point) => {
        const angleSum = data.angles.reduce((acc, val) => acc + val, 0);
        const avgAngle = angleSum / data.angles.length;
        
        let avgDistStr = "-";
        if (data.distances.length > 0) {
          const distSum = data.distances.reduce((acc, val) => acc + val, 0);
          avgDistStr = (distSum / data.distances.length).toFixed(3);
        }

        results.push({
          station,
          point,
          mean: decimalToDMS(avgAngle),
          meanDecimal: avgAngle,
          distance: avgDistStr,
          count: data.angles.length
        });
      });
    });

    return results;
  }, [rows]);

  const calculateRows = useCallback((currentRows: RowData[]) => {
    const updatedRows = [...currentRows];
    let baseFDeg: number | null = null;

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      const cDeg = parseDMS(row.face1);
      const dDeg = parseDMS(row.face2);

      // 1. Recalculate Row (E and F)
      if (!isNaN(cDeg) && !isNaN(dDeg)) {
        // 2C = II - I - 180
        let eDeg = dDeg - cDeg - 180;
        while (eDeg <= -180) eDeg += 360;
        while (eDeg > 180) eDeg -= 360;
        row.collimation = secondsOnly(eDeg);

        // Mean = (I + (II - 180)) / 2
        let dMinus180 = dDeg - 180;
        while (dMinus180 < 0) dMinus180 += 360;
        let fDeg = (cDeg + dMinus180) / 2;
        fDeg = mod360(fDeg);
        row.mean = decimalToDMS(fDeg);
      } else {
        row.collimation = '';
        row.mean = '';
      }

      // 2. Recalculate Reduced Means (G)
      const aText = row.station.trim();
      const fText = row.mean.trim();

      if (aText) {
        if (fText) {
          baseFDeg = parseDMS(fText);
          row.reducedMean = "00-00-00";
        } else {
          baseFDeg = null;
          row.reducedMean = "";
        }
      } else {
        if (baseFDeg !== null && fText) {
          const fDeg = parseDMS(fText);
          let gDeg = fDeg - baseFDeg;
          gDeg = mod360(gDeg);
          row.reducedMean = decimalToDMS(gDeg);
        } else {
          row.reducedMean = "";
        }
      }
    }
    return updatedRows;
  }, []);

  const handleInputChange = (id: string, field: keyof RowData, value: string) => {
    const newRows = rows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    );
    
    // Auto-add row if face2 is filled in the last row
    const isLastRow = rows[rows.length - 1].id === id;
    if (field === 'face2' && value.trim() !== '' && isLastRow) {
      const newId = (Math.max(...newRows.map(r => parseInt(r.id)), 0) + 1).toString();
      newRows.push({ id: newId, station: '', point: '', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' });
    }
    
    setRows(calculateRows(newRows));
  };

  const addRow = () => {
    const newId = (Math.max(...rows.map(r => parseInt(r.id)), 0) + 1).toString();
    setRows([...rows, { id: newId, station: '', point: '', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' }]);
  };

  const addRowAfter = (id: string) => {
    const index = rows.findIndex(r => r.id === id);
    if (index === -1) return;
    const newId = (Math.max(...rows.map(r => parseInt(r.id)), 0) + 1).toString();
    const newRow: RowData = { id: newId, station: '', point: '', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' };
    const newRows = [...rows];
    newRows.splice(index + 1, 0, newRow);
    setRows(calculateRows(newRows));
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    const newRows = rows.filter(row => row.id !== id);
    setRows(calculateRows(newRows));
  };

  const clearData = () => {
    if (confirm("Da li ste sigurni da želite obrisati sve podatke?")) {
      setRows([{ id: '1', station: '', point: '', distance1: '', distance2: '', face1: '', face2: '', collimation: '', mean: '', reducedMean: '' }]);
    }
  };

  const exportData = () => {
    const dataStr = JSON.stringify(rows, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trig_obrazac_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Header settings
    const leftMargin = 25;
    const rightMargin = 10;
    const topMargin = 5;
    const bottomMargin = 5;
    const pageWidth = 210;
    const contentWidth = pageWidth - leftMargin - rightMargin;
    const centerX = leftMargin + (contentWidth / 2);

    // Document Title & Metadata
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(12); // Reduced font size as requested
    doc.setFont("helvetica", "bold");
    doc.text("TRIGONOMETRIJSKI OBRAZAC 1", centerX, topMargin + 8, { align: "center" });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("IZVJESTAJ GEODETSKIH MJERENJA", centerX, topMargin + 13, { align: "center" });
    
    // Decorative line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, topMargin + 16, pageWidth - rightMargin, topMargin + 16);

    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Datum: ${new Date().toLocaleDateString('bs-BA')} | Vrijeme: ${new Date().toLocaleTimeString('bs-BA')}`, centerX, topMargin + 20, { align: "center" });

    const tableHeaders = [
      ["ST", "PT", "I- Polozaj", "Dist I [m]", "II- Polozaj", "Dist II [m]", "2C", "Sredina", "Redukovana", "Kontrola 1", "Kontrola 2"]
    ];

    const tableData: any[] = [];
    const groups: { station: string, rows: RowData[] }[] = [];
    let currentGroup: { station: string, rows: RowData[] } | null = null;
    
    rows.forEach(row => {
      if (row.station.trim() !== '') {
        currentGroup = { station: row.station.trim(), rows: [row] };
        groups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.rows.push(row);
      }
    });

    groups.forEach((group, index) => {
      let stationSumMean = 0;
      let stationSumReducedMean = 0;
      let stationSumF1 = 0;
      let stationSumF2 = 0;

      if (index > 0) {
        tableData.push([{ content: "", colSpan: 11, styles: { minCellHeight: 4, border: 0 } }]);
      }

      group.rows.forEach(row => {
        const meanSec = parseDMS(row.mean) * 3600;
        const redMeanSec = parseDMS(row.reducedMean) * 3600;
        const f1Sec = parseDMS(row.face1) * 3600;
        const f2Sec = (parseDMS(row.face2) - 180) * 3600;

        stationSumMean += meanSec;
        stationSumReducedMean += redMeanSec;
        stationSumF1 += f1Sec;
        stationSumF2 += f2Sec;

        tableData.push([
          { content: row.station, styles: { fontStyle: 'bold' } },
          row.point,
          row.face1,
          row.distance1,
          row.face2,
          row.distance2,
          row.collimation,
          row.mean,
          row.reducedMean,
          formatSecondsToDMS((f1Sec + f2Sec) / 2),
          row.mean.trim() ? formatSecondsToDMS((parseDMS(group.rows[0].mean) * 3600) + redMeanSec) : ""
        ]);
      });

      // Sum Row with subtle styling
      tableData.push([
        { content: 'SUMA', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 240, 240], halign: 'center' } },
        { content: formatSecondsToDMS(stationSumF1), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: "", styles: { fillColor: [240, 240, 240] } },
        { content: formatSecondsToDMS(stationSumF2), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: "", styles: { fillColor: [240, 240, 240] } },
        { content: "", styles: { fillColor: [240, 240, 240] } },
        { content: formatSecondsToDMS(stationSumMean), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: formatSecondsToDMS(stationSumReducedMean), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: formatSecondsToDMS((stationSumF1 + stationSumF2) / 2), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: group.rows.length > 0 && group.rows[0].mean.trim() ? formatSecondsToDMS((parseDMS(group.rows[0].mean) * 3600 * group.rows.length) + stationSumReducedMean) : "", styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
      ]);
    });

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: topMargin + 25,
      theme: 'grid',
      styles: { 
        fontSize: 6, 
        cellPadding: 1.5,
        font: "helvetica",
        lineColor: [220, 220, 220],
        lineWidth: 0.1
      },
      headStyles: { 
        fillColor: [60, 60, 60], 
        textColor: [255, 255, 255], 
        fontStyle: 'bold', 
        halign: 'center', 
        valign: 'middle' 
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 8 },
        2: { halign: 'center', cellWidth: 22 },
        3: { halign: 'right', cellWidth: 14 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 14 },
        6: { halign: 'center', cellWidth: 10 },
        7: { halign: 'center', cellWidth: 20 },
        8: { halign: 'center', cellWidth: 20 },
        9: { halign: 'center', cellWidth: 18 },
        10: { halign: 'center', cellWidth: 18 }
      },
      margin: { left: leftMargin, right: rightMargin, top: topMargin + 25, bottom: bottomMargin },
      didDrawPage: (data) => {
        // Footer with page number
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Stranica ${data.pageNumber}`,
          pageWidth - rightMargin,
          doc.internal.pageSize.height - 5,
          { align: "right" }
        );
      }
    });

    doc.save(`izvjestaj_mjerenja_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportReducedPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Header settings
    const leftMargin = 25;
    const rightMargin = 10;
    const topMargin = 5;
    const pageWidth = 210;
    const centerX = leftMargin + ((pageWidth - leftMargin - rightMargin) / 2);

    // Document Title
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("IZVJESTAJ REDUKOVANIH SREDINA", centerX, topMargin + 8, { align: "center" });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("TABELA REDUKOVANIH VRIJEDNOSTI PO STAJALISTIMA", centerX, topMargin + 13, { align: "center" });
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, topMargin + 16, pageWidth - rightMargin, topMargin + 16);

    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Datum: ${new Date().toLocaleDateString('bs-BA')} | Vrijeme: ${new Date().toLocaleTimeString('bs-BA')}`, centerX, topMargin + 20, { align: "center" });

    const tableHeaders = [["Stajaliste", "Tacka", "Redukovana Sredina", "Prosjecna Duzina [m]"]];
    const tableData = reducedRows.map(row => {
      const d1 = parseFloat(row.distance1);
      const d2 = parseFloat(row.distance2);
      let avgDistance = '-';
      if (!isNaN(d1) && !isNaN(d2)) avgDistance = ((d1 + d2) / 2).toFixed(3);
      else if (!isNaN(d1)) avgDistance = d1.toFixed(3);
      else if (!isNaN(d2)) avgDistance = d2.toFixed(3);

      return [row.displayStation, row.point, row.reducedMean, avgDistance];
    });

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: topMargin + 25,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], halign: 'center' },
      columnStyles: {
        0: { halign: 'center', fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'center', fontStyle: 'bold' },
        3: { halign: 'right' }
      },
      margin: { left: leftMargin, right: rightMargin }
    });

    doc.save(`redukovane_sredine_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportGirusPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Header settings
    const leftMargin = 25;
    const rightMargin = 10;
    const topMargin = 5;
    const pageWidth = 210;
    const centerX = leftMargin + ((pageWidth - leftMargin - rightMargin) / 2);

    // Document Title
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("IZVJESTAJ SREDINA GIRUSA", centerX, topMargin + 8, { align: "center" });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("TABELA SREDNJIH VRIJEDNOSTI IZ VISE GIRUSA", centerX, topMargin + 13, { align: "center" });
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, topMargin + 16, pageWidth - rightMargin, topMargin + 16);

    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Datum: ${new Date().toLocaleDateString('bs-BA')} | Vrijeme: ${new Date().toLocaleTimeString('bs-BA')}`, centerX, topMargin + 20, { align: "center" });

    const tableHeaders = [["Girusi", "Stajaliste", "Tacka", "Sredina iz svih girusa", "Sredina iz duzina [m]"]];
    const tableData = girusMeans.map(item => [
      `${item.count}x`,
      item.station,
      item.point,
      item.mean,
      item.distance
    ]);

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: topMargin + 25,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], halign: 'center' },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'center', fontStyle: 'bold' },
        2: { halign: 'center' },
        3: { halign: 'center', fontStyle: 'bold' },
        4: { halign: 'right' }
      },
      margin: { left: leftMargin, right: rightMargin }
    });

    doc.save(`sredina_girusa_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportExcel = () => {
    // Group rows by station for Kontrole sheet
    const groups: { station: string, rows: RowData[] }[] = [];
    let currentGroup: { station: string, rows: RowData[] } | null = null;
    
    rows.forEach((row, idx) => {
      if (row.station.trim() || idx === 0) {
        currentGroup = {
          station: row.station.trim() || "S1",
          rows: [row]
        };
        groups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.rows.push(row);
      }
    });

    const kontroleData: any[] = [];
    groups.forEach(group => {
      const stationRows = group.rows;
      const stationSumF1 = getRawSecondsSum(stationRows.map(r => r.face1));
      const stationSumF2 = getRawSecondsSum(stationRows.map(r => r.face2));
      const stationSumMean = getRawSecondsSum(stationRows.map(r => r.mean));
      const stationSumReducedMean = getRawSecondsSum(stationRows.map(r => r.reducedMean));

      stationRows.forEach((r, idx) => {
        let k1 = "";
        let k2 = "";
        
        if (idx === 0) {
          k1 = formatSecondsToDMS(stationSumF1);
          k2 = formatSecondsToDMS(parseDMS(stationRows[0].mean) * 3600 * stationRows.length);
        } else if (idx === 1) {
          k1 = formatSecondsToDMS(stationSumF2);
          k2 = formatSecondsToDMS(stationSumReducedMean);
        } else if (idx === 2) {
          k1 = formatSecondsToDMS((stationSumF1 + stationSumF2) / 2);
          k2 = formatSecondsToDMS((parseDMS(stationRows[0].mean) * 3600 * stationRows.length) + stationSumReducedMean);
        }

        kontroleData.push({
          "ST": r.station,
          "PT": r.point,
          "I Pol.": r.face1,
          "Dužina I": r.distance1,
          "II Pol.": r.face2,
          "Dužina II": r.distance2,
          "2C": r.collimation,
          "Sredina": r.mean,
          "Reduk.": r.reducedMean,
          "Kontrola 1": k1,
          "Kontrola 2": k2
        });
      });

      // Add SUMA row
      kontroleData.push({
        "ST": "SUMA",
        "PT": "",
        "I Pol.": formatSecondsToDMS(stationSumF1),
        "Dužina I": "",
        "II Pol.": formatSecondsToDMS(stationSumF2),
        "Dužina II": "",
        "2C": "",
        "Sredina": formatSecondsToDMS(stationSumMean),
        "Reduk.": formatSecondsToDMS(stationSumReducedMean),
        "Kontrola 1": formatSecondsToDMS((stationSumF1 + stationSumF2) / 2),
        "Kontrola 2": formatSecondsToDMS((parseDMS(stationRows[0].mean) * 3600 * stationRows.length) + stationSumReducedMean)
      });
      
      // Add empty row for spacing between stations
      kontroleData.push({});
    });

    // Sheet 2: Redukovane sredine (ugao ostaje D-M-S)
    const reducedData = reducedRows.map(r => {
      const d1 = parseFloat(r.distance1);
      const d2 = parseFloat(r.distance2);
      let avgDistance = '-';
      if (!isNaN(d1) && !isNaN(d2)) avgDistance = ((d1 + d2) / 2).toFixed(3);
      else if (!isNaN(d1)) avgDistance = d1.toFixed(3);
      else if (!isNaN(d2)) avgDistance = d2.toFixed(3);

      return {
        "Stajalište": r.displayStation,
        "Tačka": r.point,
        "Redukovana Sredina": r.reducedMean,
        "Prosječna Dužina [m]": avgDistance
      };
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(kontroleData);
    const ws2 = XLSX.utils.json_to_sheet(reducedData);

    XLSX.utils.book_append_sheet(wb, ws1, "Kontrole");
    XLSX.utils.book_append_sheet(wb, ws2, "Redukovane Sredine");

    // Generate buffer
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `izvjestaj_excel_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportDistancesTXT = () => {
    let txt = "ST\tPT\tDIST\n";
    girusMeans.forEach(item => {
      txt += `${item.station}\t${item.point}\t${item.distance}\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duzine_jag_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPravciTXT = () => {
    let txt = "ST\tPT\tPRAVAC\n";
    girusMeans.forEach(item => {
      txt += `${item.station}\t${item.point}\t${item.meanDecimal.toFixed(6)}\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pravci_jag_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportTXT = () => {
    let txt = "TRIGONOMETRIJSKI OBRAZAC 1\n";
    txt += "===========================\n\n";
    txt += "ST\tPT\tI Pol.\tDist I\tII Pol.\tDist II\t2C\tSredina\tReduk.\n";
    txt += "--------------------------------------------------------------------------\n";
    
    rows.forEach(r => {
      txt += `${r.station || "-"}\t${r.point || "-"}\t${r.face1 || "-"}\t${r.distance1 || "-"}\t${r.face2 || "-"}\t${r.distance2 || "-"}\t${r.collimation || "-"}\t${r.mean || "-"}\t${r.reducedMean || "-"}\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `izvjestaj_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          setRows(calculateRows(json));
        }
      } catch (err) {
        alert("Greška pri učitavanju fajla. Provjerite format.");
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
      {/* Burger Menu Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Sidebar / Drawer */}
      <div className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 transform transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} shadow-xl`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
            <span className="font-bold tracking-widest text-sm">MENI</span>
            <button onClick={() => setIsMenuOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            <button 
              onClick={() => { setActiveTab('jobs'); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${activeTab === 'jobs' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Briefcase size={16} />
              Posao
            </button>
            <button 
              onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${activeTab === 'home' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Home size={16} />
              T.O.1
            </button>
            <button 
              onClick={() => { setActiveTab('controls'); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${activeTab === 'controls' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <ShieldCheck size={16} />
              Kontrole
            </button>
            <button 
              onClick={() => { setActiveTab('reduced'); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${activeTab === 'reduced' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <RotateCcw size={16} />
              Redukovana Sredina
            </button>
            <button 
              onClick={() => { setActiveTab('girus'); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${activeTab === 'girus' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Calculator size={16} />
              Sredina Girusa
            </button>
            <button 
              onClick={() => { setActiveTab('export'); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${activeTab === 'export' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Share2 size={16} />
              Export podataka
            </button>
            <button 
              onClick={() => { setActiveTab('import'); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${activeTab === 'import' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Upload size={16} />
              Import podataka
            </button>
            <button 
              onClick={() => { setActiveTab('instructions'); setIsMenuOpen(false); }}
              className={`w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${activeTab === 'instructions' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Info size={16} />
              Uputstvo
            </button>
            <div className="pt-4 mt-4 border-t border-slate-100">
              <button 
                onClick={() => { clearData(); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 p-3 text-xs font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all rounded-lg"
              >
                <RotateCcw size={16} />
                Resetuj sve
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMenuOpen(true)}
            className="p-2 -ml-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
          >
            <Menu size={24} />
          </button>
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setIsMenuOpen(true)}
          >
            <h1 className="font-bold text-xl tracking-tight text-slate-900 group-hover:text-slate-600 transition-colors">
              {activeTab === 'home' ? 'T.O. 1' : 
               activeTab === 'girus' ? 'Sredina Girusa' : 
               activeTab === 'reduced' ? 'Redukovana Sredina' : 
               activeTab === 'export' ? 'Export podataka' : 
               activeTab === 'import' ? 'Import podataka' : 
               activeTab === 'instructions' ? 'Uputstvo' : 
               activeTab === 'jobs' ? 'Posao' : 'Kontrole'}
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`p-4 ${activeTab === 'controls' ? 'max-w-7xl' : 'max-w-5xl'} mx-auto transition-all`}>
        {activeTab === 'home' && (
          <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
            <div className="w-full">
              {/* Table Header */}
              <div 
                className="grid border-b border-slate-200 bg-slate-50 text-[7px] sm:text-[9px] md:text-[10px] uppercase tracking-wider font-bold text-slate-500"
                style={{ gridTemplateColumns: GRID_LAYOUT_HOME }}
              >
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">ST</div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">PT</div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">I Pol.</span>
                  <span className="sm:hidden">I</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">Dužina I</span>
                  <span className="sm:hidden">D I</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">II Pol.</span>
                  <span className="sm:hidden">II</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">Dužina II</span>
                  <span className="sm:hidden">D II</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">2C</div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">Sredina</span>
                  <span className="sm:hidden">Sr.</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">Reduk.</span>
                  <span className="sm:hidden">Red.</span>
                </div>
                <div className="p-1 sm:p-3"></div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-100">
                {(() => {
                  const elements: React.ReactNode[] = [];
                  
                  // Group rows by station
                  const groups: { station: string, rows: RowData[], startIndex: number }[] = [];
                  let currentGroup: { station: string, rows: RowData[], startIndex: number } | null = null;
                  
                  rows.forEach((row, idx) => {
                    if (row.station.trim() || idx === 0) {
                      currentGroup = {
                        station: row.station.trim() || "S1",
                        rows: [row],
                        startIndex: idx
                      };
                      groups.push(currentGroup);
                    } else if (currentGroup) {
                      currentGroup.rows.push(row);
                    }
                  });

                  groups.forEach((group, groupIdx) => {
                    const stationRows = group.rows;
                    const isNewStation = groupIdx > 0;

                    stationRows.forEach((row, i) => {
                      const isFirstInStationGroup = i === 0;

                      elements.push(
                        <React.Fragment key={row.id}>
                          {isNewStation && isFirstInStationGroup && (
                            <div className="h-6 sm:h-8 bg-slate-50/50 border-b border-slate-100 flex items-center px-4 relative">
                              <div className="h-[1px] w-full bg-slate-200"></div>
                              <div className="absolute left-1/2 -translate-x-1/2 bg-slate-50 px-3 py-0.5 rounded-full border border-slate-200">
                                <span className="text-[7px] sm:text-[9px] font-bold uppercase tracking-widest text-slate-400">Novo stajalište</span>
                              </div>
                            </div>
                          )}
                          <div 
                            className="grid group hover:bg-slate-50 transition-colors"
                            style={{ gridTemplateColumns: GRID_LAYOUT_HOME }}
                          >
                            <div className="border-r border-slate-100 p-0">
                              <input
                                type="text"
                                value={row.station}
                                onChange={(e) => handleInputChange(row.id, 'station', e.target.value)}
                                className="w-full h-full p-1 sm:p-2.5 text-[8px] sm:text-xs focus:outline-none bg-transparent font-bold text-center text-slate-900"
                                placeholder={isFirstInStationGroup ? group.station : ""}
                              />
                            </div>
                            <div className="border-r border-slate-100 p-0">
                              <input
                                type="text"
                                value={row.point}
                                onChange={(e) => handleInputChange(row.id, 'point', e.target.value)}
                                className="w-full h-full p-1 sm:p-2.5 text-[8px] sm:text-xs focus:outline-none bg-transparent text-center text-slate-700"
                                placeholder="P1"
                              />
                            </div>
                            <div className="border-r border-slate-100 p-0">
                              <input
                                type="text"
                                value={row.face1}
                                onChange={(e) => handleInputChange(row.id, 'face1', e.target.value)}
                                className="w-full h-full p-1 sm:p-2.5 text-[8px] sm:text-xs focus:outline-none bg-transparent text-center font-mono text-slate-600"
                                placeholder="0-00-00"
                              />
                            </div>
                            <div className="border-r border-slate-100 p-0">
                              <input
                                type="text"
                                value={row.distance1}
                                onChange={(e) => handleInputChange(row.id, 'distance1', e.target.value)}
                                className="w-full h-full p-1 sm:p-2.5 text-[8px] sm:text-xs focus:outline-none bg-transparent text-center font-mono text-slate-600"
                                placeholder="0.000"
                              />
                            </div>
                            <div className="border-r border-slate-100 p-0">
                              <input
                                type="text"
                                value={row.face2}
                                onChange={(e) => handleInputChange(row.id, 'face2', e.target.value)}
                                className="w-full h-full p-1 sm:p-2.5 text-[8px] sm:text-xs focus:outline-none bg-transparent text-center font-mono text-slate-600"
                                placeholder="180-00-00"
                              />
                            </div>
                            <div className="border-r border-slate-100 p-0">
                              <input
                                type="text"
                                value={row.distance2}
                                onChange={(e) => handleInputChange(row.id, 'distance2', e.target.value)}
                                className="w-full h-full p-1 sm:p-2.5 text-[8px] sm:text-xs focus:outline-none bg-transparent text-center font-mono text-slate-600"
                                placeholder="0.000"
                              />
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-xs flex items-center justify-center font-mono text-slate-400">
                              {row.collimation}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-xs flex items-center justify-center font-mono font-bold text-slate-900">
                              {row.mean}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-xs flex items-center justify-center font-mono text-slate-500">
                              {row.reducedMean}
                            </div>
                            
                            <div className="p-1 sm:p-2 flex items-center justify-center gap-0.5 sm:gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => addRowAfter(row.id)}
                                className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-all"
                                title="Dodaj red ispod"
                              >
                                <Plus size={10} className="sm:w-[14px] sm:h-[14px]" />
                              </button>
                              <button 
                                onClick={() => removeRow(row.id)}
                                className="p-1 sm:p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                                title="Ukloni red"
                              >
                                <Trash2 size={10} className="sm:w-[14px] sm:h-[14px]" />
                              </button>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    });
                  });
                  
                  return elements;
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'controls' && (
          <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
            <div className="w-full">
              {/* Table Header */}
              <div 
                className="grid border-b border-slate-200 bg-slate-50 text-[7px] sm:text-[9px] md:text-[10px] uppercase tracking-wider font-bold text-slate-500"
                style={{ gridTemplateColumns: GRID_LAYOUT_CONTROLS }}
              >
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">ST</div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">PT</div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">I Pol.</span>
                  <span className="sm:hidden">I</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">Dužina I</span>
                  <span className="sm:hidden">D I</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">II Pol.</span>
                  <span className="sm:hidden">II</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">Dužina II</span>
                  <span className="sm:hidden">D II</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">2C</div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">Sredina</span>
                  <span className="sm:hidden">Sr.</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center">
                  <span className="hidden sm:inline">Reduk.</span>
                  <span className="sm:hidden">Red.</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center bg-blue-50/50 text-blue-700">
                  <span className="hidden sm:inline">Kontrola 1</span>
                  <span className="sm:hidden">K1</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-slate-200 flex items-center justify-center text-center bg-emerald-50/50 text-emerald-700">
                  <span className="hidden sm:inline">Kontrola 2</span>
                  <span className="sm:hidden">K2</span>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-100">
                {(() => {
                  const elements: React.ReactNode[] = [];
                  
                  // Group rows by station
                  const groups: { station: string, rows: RowData[] }[] = [];
                  let currentGroup: { station: string, rows: RowData[] } | null = null;
                  
                  rows.forEach((row, idx) => {
                    if (row.station.trim() || idx === 0) {
                      currentGroup = {
                        station: row.station.trim() || "S1",
                        rows: [row]
                      };
                      groups.push(currentGroup);
                    } else if (currentGroup) {
                      currentGroup.rows.push(row);
                    }
                  });

                  groups.forEach((group, groupIdx) => {
                    const stationRows = group.rows;
                    const stationSumF1 = getRawSecondsSum(stationRows.map(r => r.face1));
                    const stationSumF2 = getRawSecondsSum(stationRows.map(r => r.face2));
                    const stationSumMean = getRawSecondsSum(stationRows.map(r => r.mean));
                    const stationSumReducedMean = getRawSecondsSum(stationRows.map(r => r.reducedMean));

                    // In controls tab, we ensure at least 3 rows per station for the control calculations
                    const displayRowsCount = Math.max(stationRows.length, 3);

                    for (let i = 0; i < displayRowsCount; i++) {
                      const row = stationRows[i];
                      const isFirstInStationGroup = i === 0;
                      const isSecondInStationGroup = i === 1;
                      const isThirdInStationGroup = i === 2;
                      const isNewStation = i === 0 && groupIdx > 0;

                      elements.push(
                        <React.Fragment key={row ? row.id : `empty-${group.station}-${i}`}>
                          {isNewStation && (
                            <div className="h-4 bg-slate-50/30 border-b border-slate-100"></div>
                          )}
                          <div 
                            className="grid hover:bg-slate-50 transition-colors"
                            style={{ gridTemplateColumns: GRID_LAYOUT_CONTROLS }}
                          >
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] font-bold text-center text-slate-900 flex items-center justify-center">
                              {row ? row.station : (isFirstInStationGroup ? group.station : "")}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] text-center text-slate-700 flex items-center justify-center">
                              {row ? row.point : ""}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] text-center font-mono text-slate-600 flex items-center justify-center">
                              {row ? row.face1 : ""}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] text-center font-mono text-slate-600 flex items-center justify-center">
                              {row ? row.distance1 : ""}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] text-center font-mono text-slate-600 flex items-center justify-center">
                              {row ? row.face2 : ""}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] text-center font-mono text-slate-600 flex items-center justify-center">
                              {row ? row.distance2 : ""}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] flex items-center justify-center font-mono text-slate-400">
                              {row ? row.collimation : ""}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] flex items-center justify-center font-mono font-bold text-slate-900">
                              {row ? row.mean : ""}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] flex items-center justify-center font-mono text-slate-500">
                              {row ? row.reducedMean : ""}
                            </div>
                            
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] flex items-center justify-center font-mono bg-blue-50/30 text-blue-600 font-medium">
                              {isFirstInStationGroup ? formatSecondsToDMS(stationSumF1) : 
                               isSecondInStationGroup ? formatSecondsToDMS(stationSumF2) : 
                               isThirdInStationGroup ? formatSecondsToDMS((stationSumF1 + stationSumF2) / 2) : ""}
                            </div>
                            <div className="border-r border-slate-100 p-1 sm:p-2.5 text-[8px] sm:text-[10px] flex items-center justify-center font-mono bg-emerald-50/30 text-emerald-600 font-medium">
                              {isFirstInStationGroup ? (
                                stationRows.length > 0 && stationRows[0].mean.trim() ? 
                                formatSecondsToDMS(parseDMS(stationRows[0].mean) * 3600 * stationRows.length) : ""
                              ) : 
                               isSecondInStationGroup ? formatSecondsToDMS(stationSumReducedMean) : 
                               isThirdInStationGroup ? (
                                 stationRows.length > 0 && stationRows[0].mean.trim() ? 
                                 formatSecondsToDMS((parseDMS(stationRows[0].mean) * 3600 * stationRows.length) + stationSumReducedMean) : ""
                               ) : ""}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    }

                    // Add SUMA row at the end of the station group
                    elements.push(
                      <div 
                        key={`suma-${group.station}-${groupIdx}`}
                        className="grid bg-slate-50/80 border-t border-slate-200 font-mono text-[8px] sm:text-[10px] font-bold"
                        style={{ gridTemplateColumns: GRID_LAYOUT_CONTROLS }}
                      >
                        <div className="p-1 sm:p-2.5 border-r border-slate-100 flex items-center justify-center text-slate-900 uppercase tracking-widest text-[7px] sm:text-[9px]" style={{ gridColumn: '1 / span 2' }}>
                          SUMA
                        </div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100 flex items-center justify-center text-slate-900">
                          {formatSecondsToDMS(stationSumF1)}
                        </div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100"></div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100 flex items-center justify-center text-slate-900">
                          {formatSecondsToDMS(stationSumF2)}
                        </div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100"></div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100"></div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100 flex items-center justify-center text-slate-900">
                          {formatSecondsToDMS(stationSumMean)}
                        </div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100 flex items-center justify-center text-slate-900">
                          {formatSecondsToDMS(stationSumReducedMean)}
                        </div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100 flex items-center justify-center bg-blue-50/50 text-blue-700">
                          {formatSecondsToDMS((stationSumF1 + stationSumF2) / 2)}
                        </div>
                        <div className="p-1 sm:p-2.5 border-r border-slate-100 flex items-center justify-center bg-emerald-50/50 text-emerald-700">
                          {stationRows.length > 0 && stationRows[0].mean.trim() ? 
                           formatSecondsToDMS((parseDMS(stationRows[0].mean) * 3600 * stationRows.length) + stationSumReducedMean) : ""}
                        </div>
                      </div>
                    );
                  });
                  
                  return elements;
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 p-8 rounded-2xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-slate-900 flex items-center justify-center rounded-xl shadow-lg shadow-slate-900/20">
                  <Share2 size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="font-sans font-bold text-2xl tracking-tight text-slate-900">Export podataka</h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Odaberite format za izvoz vaših mjerenja</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <button 
                  onClick={exportPDF}
                  className="flex flex-col items-center justify-center p-6 border border-blue-200 bg-blue-50/30 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all group rounded-2xl shadow-sm hover:shadow-md"
                >
                  <div className="w-14 h-14 bg-white border border-blue-100 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-blue-700 group-hover:border-blue-500 transition-all rounded-xl shadow-sm">
                    <FileDown size={28} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">PDF Izvještaj</span>
                  <span className="text-[10px] opacity-60 mt-2 text-center">Kompletan zapisnik (A4 Landscape)</span>
                </button>

                <button 
                  onClick={exportReducedPDF}
                  className="flex flex-col items-center justify-center p-6 border border-purple-200 bg-purple-50/30 text-purple-700 hover:bg-purple-600 hover:text-white hover:border-purple-600 transition-all group rounded-2xl shadow-sm hover:shadow-md"
                >
                  <div className="w-14 h-14 bg-white border border-purple-100 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-purple-700 group-hover:border-purple-500 transition-all rounded-xl shadow-sm">
                    <FileDown size={28} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">PDF Redukcija</span>
                  <span className="text-[10px] opacity-60 mt-2 text-center">Tabela redukovanih sredina</span>
                </button>

                <button 
                  onClick={exportGirusPDF}
                  className="flex flex-col items-center justify-center p-6 border border-indigo-200 bg-indigo-50/30 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all group rounded-2xl shadow-sm hover:shadow-md"
                >
                  <div className="w-14 h-14 bg-white border border-indigo-100 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-indigo-700 group-hover:border-indigo-500 transition-all rounded-xl shadow-sm">
                    <FileDown size={28} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">PDF Girusi</span>
                  <span className="text-[10px] opacity-60 mt-2 text-center">Sredina iz više girusa</span>
                </button>

                <button 
                  onClick={exportDistancesTXT}
                  className="flex flex-col items-center justify-center p-6 border border-emerald-200 bg-emerald-50/30 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all group rounded-2xl shadow-sm hover:shadow-md"
                >
                  <div className="w-14 h-14 bg-white border border-emerald-100 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-emerald-700 group-hover:border-emerald-500 transition-all rounded-xl shadow-sm">
                    <Calculator size={28} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">TXT duzine</span>
                  <span className="text-[10px] opacity-60 mt-2 text-center">Format: ST PT DIST (TAB)</span>
                </button>

                <button 
                  onClick={exportPravciTXT}
                  className="flex flex-col items-center justify-center p-6 border border-orange-200 bg-orange-50/30 text-orange-700 hover:bg-orange-600 hover:text-white hover:border-orange-600 transition-all group rounded-2xl shadow-sm hover:shadow-md"
                >
                  <div className="w-14 h-14 bg-white border border-orange-100 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-orange-700 group-hover:border-orange-500 transition-all rounded-xl shadow-sm">
                    <RotateCcw size={28} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">TXT Pravci</span>
                  <span className="text-[10px] opacity-60 mt-2 text-center">Format: ST PT PRAVAC (TAB)</span>
                </button>

                <button 
                  onClick={exportExcel}
                  className="flex flex-col items-center justify-center p-6 border border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all group rounded-2xl shadow-sm hover:shadow-md"
                >
                  <div className="w-14 h-14 bg-white border border-slate-100 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-slate-800 transition-all rounded-xl shadow-sm">
                    <Calculator size={28} className="group-hover:text-emerald-400 transition-colors" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">Excel Izvještaj</span>
                  <span className="text-[10px] opacity-60 mt-2 text-center">2 Sheeta (Kontrole + Redukcija)</span>
                </button>

                <button 
                  onClick={exportData}
                  className="flex flex-col items-center justify-center p-6 border border-gray-200 bg-gray-50/50 text-gray-500 hover:bg-gray-100 transition-all group rounded-2xl shadow-sm"
                >
                  <div className="w-14 h-14 bg-white border border-gray-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform rounded-xl shadow-sm">
                    <FileText size={28} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">JSON Backup</span>
                  <span className="text-[10px] opacity-60 mt-2 text-center">Kompletan backup posla</span>
                </button>

                <button 
                  onClick={exportTXT}
                  className="flex flex-col items-center justify-center p-6 border border-gray-200 bg-gray-50/50 text-gray-500 hover:bg-gray-100 transition-all group rounded-2xl shadow-sm"
                >
                  <div className="w-14 h-14 bg-white border border-gray-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform rounded-xl shadow-sm">
                    <Download size={28} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">Tekstualni Izvještaj</span>
                  <span className="text-[10px] opacity-60 mt-2 text-center">Pregledan format za štampu</span>
                </button>
              </div>

            </div>

            <button 
              onClick={() => setActiveTab('home')}
              className="w-full py-4 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors rounded-xl shadow-lg shadow-slate-900/10 mt-4"
            >
              Nazad na glavni obrazac
            </button>
          </div>
        )}

        {activeTab === 'girus' && (
          <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
            <div className="w-full">
              {/* Table Header */}
              <div className="grid grid-cols-[0.8fr_1fr_1fr_1.5fr_1fr] border-b border-slate-200 bg-slate-900 text-white text-[7px] sm:text-[9px] md:text-[10px] uppercase tracking-wider font-bold">
                <div className="p-1 sm:p-3 border-r border-white/10 text-center">
                  <span className="hidden sm:inline">Broj girusa</span>
                  <span className="sm:hidden">Gir.</span>
                </div>
                <div className="p-1 sm:p-3 border-r border-white/10 text-center">ST</div>
                <div className="p-1 sm:p-3 border-r border-white/10 text-center">PT</div>
                <div className="p-1 sm:p-3 border-r border-white/10 text-center">
                  <span className="hidden sm:inline">Sredina iz svih girusa</span>
                  <span className="sm:hidden">Sr. Gir.</span>
                </div>
                <div className="p-1 sm:p-3 text-center">
                  <span className="hidden sm:inline">Sredina iz dužina [m]</span>
                  <span className="sm:hidden">Sr. D.</span>
                </div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-100">
                {girusMeans.length > 0 ? (
                  girusMeans.map((item, idx) => (
                    <div key={`${item.station}-${item.point}-${idx}`} className="grid grid-cols-[0.8fr_1fr_1fr_1.5fr_1fr] hover:bg-slate-50 transition-colors">
                      <div className="p-1 sm:p-3 border-r border-slate-100 text-[8px] sm:text-xs text-center font-bold text-slate-900">{item.count}x</div>
                      <div className="p-1 sm:p-3 border-r border-slate-100 text-[8px] sm:text-xs font-bold text-center text-slate-900">{item.station}</div>
                      <div className="p-1 sm:p-3 border-r border-slate-100 text-[8px] sm:text-xs text-center text-slate-600">{item.point}</div>
                      <div className="p-1 sm:p-3 border-r border-slate-100 text-[8px] sm:text-xs font-mono font-bold text-blue-600 text-center">{item.mean}</div>
                      <div className="p-1 sm:p-3 text-[8px] sm:text-xs text-center font-medium text-slate-400">{item.distance}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center">
                    <Calculator size={32} className="mx-auto mb-4 text-slate-200" />
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Nema dovoljno podataka za proračun</p>
                    <p className="text-[10px] text-slate-300 mt-1">Unesite mjerenja u Trig. obrazac 1</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-6">
            {/* Create New Job */}
            <div className="p-6 border border-slate-200 bg-white shadow-xl shadow-slate-200/50 rounded-2xl">
              <h2 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-slate-900">
                <Plus size={14} /> Novi Posao
              </h2>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  placeholder="Naziv posla (npr. Gradilište A)"
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
                />
                <button 
                  onClick={createNewJob}
                  className="px-6 py-2.5 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors rounded-xl shadow-lg shadow-slate-900/20"
                >
                  Kreiraj
                </button>
              </div>
            </div>

            {/* Jobs List */}
            <div className="p-6 border border-slate-200 bg-white shadow-xl shadow-slate-200/50 rounded-2xl">
              <h2 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-slate-900">
                <Briefcase size={14} /> Lista Poslova
              </h2>
              
              {jobs.length > 0 ? (
                <div className="space-y-3">
                  {jobs.map(job => (
                    <div 
                      key={job.id}
                      className={`p-4 border border-slate-100 rounded-xl flex items-center justify-between transition-all ${currentJobId === job.id ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'}`}
                    >
                      <div className="flex-1 cursor-pointer" onClick={() => selectJob(job.id)}>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{job.name}</span>
                          {currentJobId === job.id && (
                            <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Aktivan</span>
                          )}
                        </div>
                        <div className={`flex items-center gap-3 mt-1 text-[10px] ${currentJobId === job.id ? 'text-white/60' : 'text-slate-400'}`}>
                          <span className="flex items-center gap-1"><Calendar size={10} /> {job.date}</span>
                          <span className="flex items-center gap-1"><FileText size={10} /> {job.rows.length} redova</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => selectJob(job.id)}
                          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg ${currentJobId === job.id ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                        >
                          Učitaj
                        </button>
                        <button 
                          onClick={() => deleteJob(job.id)}
                          className={`p-1.5 transition-colors rounded-lg ${currentJobId === job.id ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl">
                  <Briefcase size={32} className="mx-auto mb-4 text-slate-200" />
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Nema sačuvanih poslova</p>
                </div>
              )}
            </div>

            {currentJobId && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 rounded-xl">
                <ShieldCheck size={14} />
                Automatsko spašavanje je aktivno za posao: {jobs.find(j => j.id === currentJobId)?.name}
              </div>
            )}
          </div>
        )}

        {activeTab === 'import' && (
          <div className="space-y-6">
            <div className="p-8 border border-slate-200 bg-white shadow-xl shadow-slate-200/50 rounded-2xl text-center">
              <div className="w-16 h-16 bg-slate-100 flex items-center justify-center rounded-2xl mx-auto mb-6">
                <Upload size={32} className="text-slate-900" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Uvezi podatke</h2>
              <p className="text-sm text-slate-500 mb-8 max-w-md mx-auto">
                Odaberite prethodno izvezeni <span className="font-mono font-bold">.json</span> fajl kako biste učitali podatke u aplikaciju.
              </p>
              
              <label className="inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all rounded-xl shadow-lg shadow-slate-900/20 cursor-pointer">
                <Upload size={18} />
                Odaberi .json fajl
                <input type="file" accept=".json" onChange={importData} className="hidden" />
              </label>
            </div>
          </div>
        )}

        {activeTab === 'instructions' && (
          <div className="space-y-6">
            <div className="p-8 border border-slate-200 bg-white shadow-xl shadow-slate-200/50 rounded-2xl">
              <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 bg-slate-900 flex items-center justify-center rounded-xl shadow-lg shadow-slate-900/20">
                  <Info size={20} className="text-white" />
                </div>
                <h2 className="font-sans font-bold text-2xl text-slate-900">Uputstvo za rad</h2>
              </div>
              
              <div className="space-y-8">
                <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-blue-700">1. Unos podataka</h3>
                  <p className="text-sm leading-relaxed text-slate-600 mb-4">
                    Glavni obrazac (Trig. obrazac 1) služi za unos terenskih opažanja. Podaci se unose red po red.
                  </p>
                  <ul className="text-sm space-y-3 list-disc list-inside text-slate-600">
                    <li><strong>Format uglova</strong>: Uglove unosite isključivo u formatu <code className="bg-slate-200 px-2 py-0.5 rounded text-slate-900 font-mono text-xs">DD-MM-SS</code> (npr. 12-30-45).</li>
                    <li><strong>Stajalište (ST)</strong>: Naziv stajališta unosite samo u prvom redu za tu stanicu. Program automatski prepoznaje promjenu stanice.</li>
                    <li><strong>Dužine</strong>: Unesite dužine za I i II položaj. Program će automatski izračunati srednju dužinu.</li>
                  </ul>
                </section>

                <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-emerald-700">2. Automatska obrada</h3>
                  <p className="text-sm leading-relaxed text-slate-600 mb-4">
                    Dok unosite podatke, program u realnom vremenu vrši sljedeće proračune:
                  </p>
                  <ul className="text-sm space-y-3 list-disc list-inside text-slate-600">
                    <li><strong>2C (Kolimacija)</strong>: Razlika između II i I položaja. Prikazuje se u sekundama.</li>
                    <li><strong>Sredina</strong>: Srednja vrijednost pravaca iz oba položaja.</li>
                    <li><strong>Redukovana sredina</strong>: Vrijednost pravca u odnosu na prvi (nulti) pravac na tom stajalištu.</li>
                  </ul>
                </section>

                <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-indigo-700">3. Analiza i Export</h3>
                  <ul className="text-sm space-y-3 list-disc list-inside text-slate-600">
                    <li><strong>Kontrole</strong>: Tab "Kontrole" nudi prošireni pregled sa sumama i prosječnim vrijednostima po stajalištima.</li>
                    <li><strong>Sredina Girusa</strong>: Ako opažate istu tačku sa iste stanice u više girusa, ovdje ćete vidjeti njihovu konačnu srednju vrijednost.</li>
                    <li><strong>Export</strong>: Podatke možete izvesti u PDF formatu ili u TXT formatu za dalju obradu.</li>
                  </ul>
                </section>
              </div>

              <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-slate-100 pt-8">
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">Autor aplikacije</p>
                  <p className="text-sm font-bold text-slate-900">Amer Moco, Mart- 2026.</p>
                </div>
                <button 
                  onClick={() => setActiveTab('home')}
                  className="w-full sm:w-auto px-8 py-4 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors rounded-xl shadow-lg shadow-slate-900/20"
                >
                  Počni sa radom
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reduced' && (
          <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
            <div className="w-full">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_1fr_1.5fr_1fr] border-b border-slate-200 bg-slate-900 text-white text-[7px] sm:text-[9px] md:text-[10px] uppercase tracking-wider font-bold">
                <div className="p-1 sm:p-3 border-r border-white/10 text-center">ST</div>
                <div className="p-1 sm:p-3 border-r border-white/10 text-center">PT</div>
                <div className="p-1 sm:p-3 border-r border-white/10 text-center">
                   <span className="hidden sm:inline">Redukovana Sredina</span>
                   <span className="sm:hidden">Red. Sr.</span>
                </div>
                <div className="p-1 sm:p-3 text-center">D.</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-slate-100">
                {reducedRows.length > 0 ? (
                  reducedRows.map((row, index) => {
                    const d1 = parseFloat(row.distance1);
                    const d2 = parseFloat(row.distance2);
                    let avgDistance = '-';
                    
                    if (!isNaN(d1) && !isNaN(d2)) {
                      avgDistance = ((d1 + d2) / 2).toFixed(3);
                    } else if (!isNaN(d1)) {
                      avgDistance = d1.toFixed(3);
                    } else if (!isNaN(d2)) {
                      avgDistance = d2.toFixed(3);
                    }

                    const isNewStation = index > 0 && row.isStationStart;

                    return (
                      <React.Fragment key={row.id}>
                        {isNewStation && (
                          <div className="h-6 sm:h-8 bg-slate-50/50 border-b border-slate-100 flex items-center px-4 relative">
                            <div className="h-[1px] w-full bg-slate-200"></div>
                            <div className="absolute left-1/2 -translate-x-1/2 bg-slate-50 px-3 py-0.5 rounded-full border border-slate-200">
                              <span className="text-[7px] sm:text-[9px] font-bold uppercase tracking-widest text-slate-400">Novo stajalište</span>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-[1fr_1fr_1.5fr_1fr] hover:bg-slate-50 transition-colors">
                          <div className="p-1 sm:p-3 border-r border-slate-100 text-[8px] sm:text-xs font-bold text-center text-slate-900">{row.displayStation}</div>
                          <div className="p-1 sm:p-3 border-r border-slate-100 text-[8px] sm:text-xs text-center text-slate-600">{row.point}</div>
                          <div className="p-1 sm:p-3 border-r border-slate-100 text-[8px] sm:text-xs font-mono font-bold text-emerald-600 text-center">{row.reducedMean}</div>
                          <div className="p-1 sm:p-3 text-[8px] sm:text-xs text-center font-medium text-slate-400">{avgDistance}</div>
                        </div>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <div className="p-12 text-center">
                    <Info size={32} className="mx-auto mb-4 text-slate-200" />
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Nema redukovanih vrijednosti</p>
                    <p className="text-[10px] text-slate-300 mt-1">Unesite mjerenja u Trig. obrazac 1</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 z-50 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Tab Specific Actions */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
            {activeTab === 'home' && (
              <>
                <button 
                  onClick={addRow}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 rounded-xl shadow-lg shadow-slate-900/20"
                >
                  <Plus size={16} />
                  Dodaj red
                </button>
                <button 
                  onClick={exportPDF}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 rounded-xl shadow-lg shadow-blue-600/20"
                >
                  <FileDown size={16} />
                  PDF Izvještaj
                </button>
                <div className="hidden md:flex flex-col ml-2">
                  <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">Ukupno redova</span>
                  <span className="text-xs font-bold text-slate-900">{rows.length}</span>
                </div>
              </>
            )}

            {activeTab === 'controls' && (
              <>
                <button 
                  onClick={exportPDF}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 rounded-xl shadow-lg shadow-blue-600/20"
                >
                  <FileDown size={16} />
                  PDF Izvještaj
                </button>
                <div className="hidden md:flex flex-col ml-2">
                  <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">Ukupno redova</span>
                  <span className="text-xs font-bold text-slate-900">{rows.length}</span>
                </div>
              </>
            )}

            {activeTab === 'girus' && (
              <>
                <button 
                  onClick={exportGirusPDF}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 rounded-xl shadow-lg shadow-blue-600/20"
                >
                  <FileDown size={16} />
                  PDF Export
                </button>
                <button 
                  onClick={() => setActiveTab('home')}
                  className="px-5 py-2.5 bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-all rounded-xl"
                >
                  Nazad na unos
                </button>
                <div className="hidden md:flex flex-col ml-2">
                  <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">Ukupno tačaka</span>
                  <span className="text-xs font-bold text-slate-900">{girusMeans.length}</span>
                </div>
              </>
            )}

            {activeTab === 'reduced' && (
              <>
                <button 
                  onClick={exportReducedPDF}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-purple-700 transition-all active:scale-95 rounded-xl shadow-lg shadow-purple-600/20"
                >
                  <FileDown size={16} />
                  PDF Export
                </button>
                <button 
                  onClick={() => setActiveTab('home')}
                  className="px-5 py-2.5 bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-all rounded-xl"
                >
                  Nazad na unos
                </button>
                <div className="hidden md:flex flex-col ml-2">
                  <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">Ukupno redova</span>
                  <span className="text-xs font-bold text-slate-900">{reducedRows.length}</span>
                </div>
              </>
            )}

            {/* Default fallback for other tabs */}
            {['export', 'jobs', 'instructions'].includes(activeTab) && (
              <button 
                onClick={() => setActiveTab('home')}
                className="px-5 py-2.5 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all rounded-xl shadow-lg shadow-slate-900/20"
              >
                Nazad na glavni obrazac
              </button>
            )}
          </div>

          {/* Footer Copyright Text */}
          <div className="flex flex-col items-center sm:items-end">
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-slate-400">
              Trigonomentrijski obrazac 1 &copy; 2026
            </p>
            <p className="text-[7px] text-slate-300 uppercase tracking-widest mt-1 hidden sm:block">
              Geodetski proračuni v2.0
            </p>
          </div>
        </div>
      </div>
      
      {/* Spacer to prevent content from being hidden behind the fixed bar */}
      <div className="h-32"></div>
    </div>
  );
}
