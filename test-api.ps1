$ErrorActionPreference = 'Continue'
$r1 = Invoke-RestMethod -Uri http://localhost:3000/api/names
"names count: $($r1.names.Count)"

try { Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/vote -ContentType 'application/json' -Body '{"fullName":"Test One","choices":["KatagaFinds"]}'; "ERR: 1-choice accepted" } catch { "OK one-choice rejected: HTTP $($_.Exception.Response.StatusCode.value__)" }

try { Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/vote -ContentType 'application/json' -Body '{"fullName":"Test Same","choices":["KatagaFinds","KatagaFinds"]}'; "ERR: same-choice accepted" } catch { "OK identical choices rejected: HTTP $($_.Exception.Response.StatusCode.value__)" }

try { Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/vote -ContentType 'application/json' -Body '{"fullName":"Test Bad","choices":["FakeName1","KatagaFinds"]}'; "ERR: invalid name accepted" } catch { "OK invalid name rejected: HTTP $($_.Exception.Response.StatusCode.value__)" }

try { Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/vote -ContentType 'application/json' -Body '{"fullName":"Test Three","choices":["KatagaFinds","KATAMBAY","KATAGA Hub"]}'; "ERR: 3-choices accepted" } catch { "OK 3-choices rejected: HTTP $($_.Exception.Response.StatusCode.value__)" }

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/vote -ContentType 'application/json' -Body '{"fullName":"  JUAN   DELA   CRUZ  ","choices":["KatagaFinds","KATAMBAY"]}' | Out-Null
"OK vote 1 cast (Juan Dela Cruz)"

try { Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/vote -ContentType 'application/json' -Body '{"fullName":"juan dela cruz","choices":["KATAGA Hub","KATAGA FAIR"]}'; "ERR: duplicate accepted" } catch { "OK duplicate rejected: HTTP $($_.Exception.Response.StatusCode.value__)" }

$chk = Invoke-RestMethod -Uri 'http://localhost:3000/api/check?name=JUAN DELA CRUZ'
"OK check duplicate: voted=$($chk.voted)"

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/vote -ContentType 'application/json' -Body '{"fullName":"Maria Santos","choices":["Kataga Marketverse","KATAGA Hub"]}' | Out-Null
"OK vote 2 cast (Maria Santos)"

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/vote -ContentType 'application/json' -Body '{"fullName":"Pedro Reyes","choices":["KatagaFinds","Kataga Marketverse"]}' | Out-Null
"OK vote 3 cast (Pedro Reyes)"

$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try { Invoke-RestMethod -Uri http://localhost:3000/api/admin/results -WebSession $s | Out-Null; "ERR: admin open without login" } catch { "OK admin blocked without login: HTTP $($_.Exception.Response.StatusCode.value__)" }

try { Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/admin/login -ContentType 'application/json' -Body '{"password":"wrongpass"}' -WebSession $s | Out-Null; "ERR: wrong password accepted" } catch { "OK wrong password rejected: HTTP $($_.Exception.Response.StatusCode.value__)" }

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/admin/login -ContentType 'application/json' -Body '{"password":"kataga2025"}' -WebSession $s | Out-Null
"OK admin login works"

$res = Invoke-RestMethod -Uri http://localhost:3000/api/admin/results -WebSession $s
"respondents: $($res.totalRespondents), votes cast: $($res.totalVotes)"
"top 2: $($res.results[0].name) ($($res.results[0].votes) votes, $($res.results[0].percentage)%) | $($res.results[1].name) ($($res.results[1].votes) votes, $($res.results[1].percentage)%)"
"result rows: $($res.results.Count), respondent rows: $($res.respondents.Count)"

$csv = Invoke-WebRequest -Uri http://localhost:3000/api/admin/export.csv -WebSession $s
"CSV header + $($res.totalRespondents) data rows: total lines $(($csv.Content -split "`r`n").Count)"

$p1 = Invoke-WebRequest -Uri http://localhost:3000/ -WebSession $s
"voting page loads: HTTP $($p1.StatusCode)"
$p2 = Invoke-WebRequest -Uri http://localhost:3000/admin -WebSession $s
"admin page loads: HTTP $($p2.StatusCode)"
$css = Invoke-WebRequest -Uri http://localhost:3000/styles.css -WebSession $s
"styles.css loads: HTTP $($css.StatusCode)"
$appjs = Invoke-WebRequest -Uri http://localhost:3000/app.js -WebSession $s
"app.js loads: HTTP $($appjs.StatusCode)"
$admjs = Invoke-WebRequest -Uri http://localhost:3000/admin.js -WebSession $s
"admin.js loads: HTTP $($admjs.StatusCode)"
