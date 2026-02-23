$path = 'c:\Users\ttrob\.gemini\antigravity\scratch\components\TeachersModule.tsx'
$c = Get-Content $path -Raw
$target = '<span className="text-[7px] font-black text-[#fbbf24] bg-[#fbbf24]/10 px-1.5 py-0.5 border border-[#fbbf24]/20 uppercase">{exam.slot.replace(''exam'', '''').toUpperCase()}. YAZILI</span>'
$replacement = "$target`n                                                 {exam.type && (`n                                                    <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 border rounded-sm ml-2 ${exam.type === 'TYT' || exam.type === 'AYT' || exam.type === 'LGS' ? 'bg-purple-600/20 border-purple-500/30 text-purple-400' : 'bg-blue-600/20 border-blue-500/30 text-blue-400'}`}>`n                                                       {exam.type}`n                                                    </span>`n                                                 )}"

$c = $c.Replace($target, $replacement)
$c | Set-Content $path -NoNewline
