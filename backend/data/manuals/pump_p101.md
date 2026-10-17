# AquaFlow CP-80 coolant pump P-101: operation and maintenance manual

Plant copy for coolant pump P-101 (cooling loop). Fictional equipment, written for the Operion demo. Section IDs are referenced by work orders and by the maintenance assistant; do not renumber them.

## [P101-OV-01] Overview and specifications

P-101 is an AquaFlow CP-80 end-suction centrifugal pump. It circulates coolant through the plant cooling loop, so a stop on P-101 quickly becomes a stop for the equipment it cools.

**Duty point:** 120 m³/h at 42 m head.

**Motor:** 30 kW, 400 V, 2950 rpm. Normal motor current is about 52 A.

**Bearings:** drive end 6309 C3 (`BRG-6309-C3`), non-drive end 6308 C3 (`BRG-6308-C3`). Lubricate with EP2 grease (`GREASE-EP2`) every 2,000 operating hours (P101-PR-03).

**Seal and coupling:** 45 mm mechanical seal (`SEAL-M80`); flexible coupling element (`CPL-ELEM-80`).

**Monitored signals and normal ranges** (at normal plant load):

| Signal | Normal range |
|---|---|
| Overall vibration (`vibration_rms`) | 1.5–2.5 mm/s |
| High-frequency vibration energy (`vibration_hf`) | 0.25–0.35 g |
| Bearing temperature (`bearing_temp`) | 50–60 °C |
| Motor winding temperature (`motor_temp`) | 65–80 °C |
| Motor current (`motor_current`) | 48–56 A |
| Discharge pressure (`discharge_pressure`) | 4.0–4.4 bar |
| Flow (`flow`) | 112–128 m³/h |

**Legacy alarm limits** (fixed thresholds in the control system):

| Signal | Alarm when |
|---|---|
| `vibration_rms` | > 7.1 mm/s |
| `bearing_temp` | > 85 °C |
| `motor_temp` | > 120 °C |
| `motor_current` | > 62 A |
| `discharge_pressure` | < 3.3 bar |
| `flow` | < 100 m³/h |

`vibration_hf` is **not** covered by the legacy alarm system. It has no fixed limit, so an early rise in this signal raises no alarm in the control room. Watch its trend against the normal range above.

## [P101-TS-01] Troubleshooting: bearing wear

**Symptoms** (in the order they appear)
1. High-frequency vibration energy (`vibration_hf`) rises first. A high-frequency rise is the clear early sign of a bearing defect: at this stage every other signal is still normal.
2. Overall vibration (`vibration_rms`) follows only many hours later, once the damage has spread.
3. Bearing temperature (`bearing_temp`) climbs near the end.
4. Motor current (`motor_current`) rises slightly just before the bearing seizes.

Discharge pressure (`discharge_pressure`) and flow (`flow`) stay normal throughout.

**Key rule:** bearing wear always starts with `vibration_hf`. If `vibration_rms` is the signal that moved first while `vibration_hf` is still near normal, it is not bearing wear: check shaft misalignment (P101-TS-03).

**Typical progression**
Bearing wear takes about 2 days (48 h) at full load from the first high-frequency rise (`vibration_hf`) to bearing seizure. The legacy vibration alarm usually fires only in the last part of that window.

**Likely causes**
Bearing wear usually comes from missed or insufficient lubrication, contaminated grease, end of bearing life, or over-greasing.

**What to do**
1. Confirm the high-frequency reading with a handheld vibration analyser on the bearing housing.
2. Re-grease now to slow the damage (P101-PR-03).
3. Plan a stop within 24 h.
4. Lock out and tag out the pump (P101-SAF-01).
5. Replace the bearings (P101-PR-01).
6. Check shaft alignment after reassembly (P101-PR-02).
7. Test run and confirm high-frequency vibration energy (`vibration_hf`) is back near its normal range.

**Parts**
`BRG-6309-C3`, `BRG-6308-C3`, `GREASE-EP2`.

**Category**
Mechanical.

**Do not confuse with**
Shaft misalignment (P101-TS-03) and impeller imbalance (P101-TS-05): `vibration_rms` moves first and `vibration_hf` stays near normal.

## [P101-TS-02] Troubleshooting: cavitation

**Symptoms** (in the order they appear)
1. Discharge pressure dropping and fluctuating (`discharge_pressure`) instead of holding steady.
2. Flow falling (`flow`), in step with the pressure.
3. Overall vibration (`vibration_rms`) rises with broadband noise. At the pump you hear a crackling sound, like gravel passing through the casing.
4. `vibration_hf` rises moderately.
5. Motor current (`motor_current`) drops, because the pump is doing less work.

Bearing temperature (`bearing_temp`) and motor temperature (`motor_temp`) stay normal.

**Typical progression**
Cavitation erodes the impeller in a few hours up to about 1 day (20 h), and cooling flow is lost. Pressure dropping and flow falling together is the warning to act.

**Likely causes**
Cavitation happens when the pressure at the pump inlet is too low: low suction tank level, clogged suction strainer (`STR-DN125`), partly closed suction valve, coolant too hot, or air entering the suction line.

**What to do**
1. Check the suction tank level and top up if low.
2. Check that the suction valve is fully open.
3. Clean the suction strainer (P101-PR-04).
4. Reduce flow demand on the cooling loop if possible.
5. Check suction conditions: coolant temperature and air leaks at suction flanges.

**Parts**
`STR-DN125`.

**Category**
Process.

**Do not confuse with**
Bearing wear (P101-TS-01): discharge pressure and flow stay normal. Mechanical seal leak (P101-TS-06): coolant is lost at the seal and the tank level falls slowly, but pressure does not fluctuate and there is no crackling noise.

## [P101-TS-03] Troubleshooting: shaft misalignment

**Symptoms** (in the order they appear)
1. Overall vibration rising (`vibration_rms`), steadily, strongest at 1× and 2× running speed and in the axial direction. At early detection it is often the only signal that has moved.
2. Bearing temperature rising (`bearing_temp`), moderately, on both bearings.
3. Motor current rising (`motor_current`) slightly, and `motor_temp` creeping up a little, because the coupling works against a bent load path.

`vibration_hf` stays near normal or rises only a little.

**Key rule:** overall vibration rising first, then bearing temperature rising, with `vibration_hf` still near normal, points to misalignment, not bearing wear. Overall vibration is the leading signal of misalignment. Recent alignment work or a coupling replacement in the maintenance history supports misalignment.

**Typical progression**
Misalignment leads to coupling or bearing damage in about 3 days (72 h).

**Likely causes**
Misalignment usually follows recent maintenance work that disturbed the alignment, base settling, soft foot, thermal growth of the pump or motor, or a worn coupling element.

**What to do**
1. Lock out and tag out the pump (P101-SAF-01).
2. Inspect the coupling element for cracks and wear; replace it if damaged.
3. Run a laser alignment (P101-PR-02).
4. Do a soft-foot check before correcting (P101-PR-02).
5. Correct with shims and re-measure.

**Parts**
`CPL-ELEM-80`, `SHIM-KIT-80`.

**Category**
Mechanical.

**Do not confuse with**
Bearing wear (P101-TS-01): `vibration_hf` rises first and clearly, long before bearing temperature moves. Impeller imbalance (P101-TS-05): vibration is radial at 1× speed, and temperatures and current do not change.

## [P101-TS-04] Troubleshooting: motor overheating

**Symptoms** (in the order they appear)
1. Motor temperature rising (`motor_temp`) steadily, in the winding.
2. Motor current (`motor_current`) increases together with the motor temperature.
3. Bearing temperature (`bearing_temp`) rises only slightly, from heat conducted out of the motor.

Vibration stays normal: `vibration_rms` and `vibration_hf` do not change.

**Key rule:** motor temperature rising with motor current rising while vibration stays normal points to motor overheating, not to the pump.

**Typical progression**
An overheating motor reaches a thermal trip or damages the winding insulation in about 1.5 days (36 h). Do not let the motor overheat repeatedly: each overheat ages the insulation.

**Likely causes**
Blocked fan cover or dirty cooling fins, damaged cooling fan (`FAN-MTR-30`), supply voltage imbalance between phases, overload, or ageing insulation.

**What to do**
1. Check and clean the fan cover and cooling fins (P101-PR-05).
2. Measure the phase voltages and phase currents (P101-PR-05).
3. Test the insulation resistance (P101-PR-05).
4. Reduce the load on the pump if the process allows it.

**Parts**
`FAN-MTR-30`.

**Category**
Electrical.

**Do not confuse with**
Bearing wear (P101-TS-01): vibration changes first, and motor temperature stays normal until the very end.

## [P101-TS-05] Troubleshooting: impeller imbalance

**Symptoms** (in the order they appear)
1. Overall vibration (`vibration_rms`) rises at 1× running speed, in the radial direction.

There is no rise in `vibration_hf`. Bearing temperature (`bearing_temp`), motor temperature (`motor_temp`) and motor current (`motor_current`) stay normal.

**Typical progression**
Imbalance develops slowly: the vibration level creeps up over weeks.

**Likely causes**
Imbalance comes from deposits building up on the impeller, erosion of the vanes, or a broken vane.

**What to do**
1. Lock out and tag out the pump (P101-SAF-01).
2. Open the casing and inspect the impeller.
3. Clean off deposits and check the vanes for erosion or cracks.
4. Have the impeller balanced, or replace it if it is damaged (`IMP-CP80`, 21-day lead time).

**Parts**
`IMP-CP80`.

**Category**
Mechanical.

**Do not confuse with**
Bearing wear (P101-TS-01): `vibration_hf` rises first. Shaft misalignment (P101-TS-03): the vibration pattern is different and other signals move too.

## [P101-TS-06] Troubleshooting: mechanical seal leak

**Symptoms** (in the order they appear)
1. Visible leakage of coolant at the mechanical seal, dripping from under the seal housing.
2. A slow drop in the coolant tank level.
3. Later, possible contamination of the bearings by coolant.

The monitored signals are mostly normal. A seal leak is found by looking, not by the sensors.

**Typical progression**
A seal leak usually grows over days to weeks. Leaking coolant can reach the bearings and shorten their life.

**Likely causes**
Worn seal faces, dry running, or seal damage during earlier maintenance.

**What to do**
1. Estimate the leak rate and keep the coolant tank topped up.
2. Order the seal now: `SEAL-M80` is currently out of stock, with a 9-day lead time.
3. Lock out and tag out the pump (P101-SAF-01).
4. Replace the mechanical seal.
5. Check the bearings for coolant contamination while the pump is open.

**Parts**
`SEAL-M80`.

**Category**
Mechanical.

**Do not confuse with**
Cavitation (P101-TS-02): the tank level can also fall, but there discharge pressure fluctuates and flow drops with a crackling noise.

## [P101-PR-01] Procedure: bearing replacement

**Effort:** 6–8 h, 2 technicians.
**Parts:** `BRG-6309-C3` (drive end), `BRG-6308-C3` (non-drive end), `GREASE-EP2`.
**Tools:** bearing puller, induction heater, torque wrench, laser alignment kit.

1. Lock out and tag out the pump (P101-SAF-01).
2. Close the suction and discharge valves and drain the casing.
3. Remove the coupling guard and decouple the pump from the motor.
4. Remove the bearing covers on both ends.
5. Pull the old bearings with the puller. Keep them for inspection: pitting or discoloured races confirm the diagnosis.
6. Clean the shaft and housings. Inspect the shaft seats for wear or scoring.
7. Heat the new bearing on the induction heater to no more than 110 °C. Never heat a bearing with a flame.
8. Mount the bearing against its shoulder and let it cool in place.
9. Fill each bearing to about 1/3 of its free space with `GREASE-EP2`.
10. Refit the covers, recouple and refit the coupling guard.
11. Check alignment (P101-PR-02).
12. Remove the locks, restart and run for 30 minutes. Confirm that `vibration_hf` is back near its baseline and that bearing temperature (`bearing_temp`) settles in the normal range.

Record both bearing part numbers and the final readings in the maintenance system.

## [P101-PR-02] Procedure: laser shaft alignment

**Effort:** 2–4 h, 1 technician.
**Parts:** `SHIM-KIT-80`; `CPL-ELEM-80` if the coupling element is worn.

1. Lock out and tag out the pump (P101-SAF-01).
2. Clean the feet and the baseplate.
3. Soft-foot check: loosen one foot at a time with a dial gauge mounted. Any foot that lifts more than 0.05 mm must be shimmed before you go on.
4. Mount the laser heads on the pump shaft and the motor shaft.
5. Measure in three positions, turning both shafts together.
6. Correct the motor position: vertical with shims, horizontal with the jacking screws.
7. Tighten the feet to torque and re-measure.
8. Repeat until the readings are inside the tolerances below.

**Tolerances for 3000 rpm:**
- Offset: ≤ 0.05 mm
- Angularity: ≤ 0.05 mm per 100 mm

Record the final readings (offset and angularity in both planes) in the maintenance system. After an alignment, check overall vibration (`vibration_rms`) at the next start: it should be back in the normal range.

## [P101-PR-03] Procedure: lubrication (re-greasing)

**Interval:** every 2,000 operating hours.
**Amount:** about 20 g per bearing of `GREASE-EP2`.
**Effort:** 30 min, 1 technician. The pump can stay running.

1. Wipe the grease nipples clean on both bearing housings.
2. Check that the grease relief plug is open, so old grease can escape.
3. Pump in about 20 g per bearing, slowly.
4. Let the pump run for about 30 minutes with the relief plug open, then close it.
5. Check bearing temperature (`bearing_temp`): a short rise after greasing is normal and should settle within an hour.

**Do not over-grease.** Too much grease churns, heats the bearing and shortens its life. Use the stated amount, never "until it comes out".

Record every re-greasing, or every skipped one, in the maintenance system. A missed re-greasing is a known cause of early bearing damage.

**Note:** for early-stage bearing wear (P101-TS-01), re-greasing slows the damage, but it does **not** repair it. A bearing that shows a rising `vibration_hf` still needs replacing (P101-PR-01).

## [P101-PR-04] Procedure: suction side inspection and strainer cleaning

**Effort:** 1–2 h, 1 technician.
**Parts:** `STR-DN125` (spare basket); strainer housing gasket.

1. Lock out and tag out the pump (P101-SAF-01).
2. Close the suction valve, and the discharge valve as well.
3. Open the drain on the strainer housing and let the coolant run out.
4. Open the strainer housing cover.
5. Lift out the basket. Clean it, or replace it with `STR-DN125` if the mesh is torn or badly clogged.
6. Check the housing gasket and replace it if it is flattened or cracked.
7. Refit the basket and close the cover.
8. Open the suction valve slowly to refill, and vent the pump casing until coolant runs without air.
9. Remove the locks and restart.
10. Confirm that discharge pressure (`discharge_pressure`) and flow (`flow`) return to their normal ranges and stay steady.

While the strainer is open, also check the suction tank level and that the suction valve opens fully.

## [P101-PR-05] Procedure: motor cooling and insulation checks

**Effort:** 1–2 h, 1 electrical technician.
**Parts:** `FAN-MTR-30` if the fan is damaged.

1. Lock out and tag out the pump (P101-SAF-01).
2. Remove the fan cover. Clean the cover grille and the motor cooling fins of dust and fibres.
3. Inspect the cooling fan for cracked or missing blades and a loose hub. Replace it with `FAN-MTR-30` if damaged.
4. Refit the fan cover.
5. With the motor running, measure the three phase voltages. The imbalance must be ≤ 1%.
6. Measure the three phase currents and compare them with motor current (`motor_current`) in the control system.
7. Stop and lock out again. Disconnect the motor cables and run an insulation resistance test at 500 V DC, each phase to earth.
8. **Result:** ≥ 100 MΩ is good. Lower values mean the winding is ageing or damp; report it to the supervisor.

After restart, watch motor winding temperature (`motor_temp`) for an hour. It should settle in the normal range.

## [P101-SAF-01] Safety: lockout/tagout before any work

No work on P-101 starts until it is locked out. This applies to every procedure in this manual.

1. Notify the control room that P-101 is going out of service.
2. Stop the pump from the local control station.
3. Open the motor breaker and lock it with your personal lock. Attach your tag with your name and the date.
4. Try to start the pump from the local station to verify zero energy. Nothing must happen.
5. Close the suction and discharge valves and lock them closed.
6. Relieve the pressure and drain the casing.
7. Beware hot surfaces: the casing, bearing housings and motor can be above 60 °C. Wear gloves.
8. Beware residual coolant in the casing and pipework when you open anything.
9. Each person working on the pump puts their own lock on the breaker.

Remove your lock only when the work is complete, the guards are back in place and everyone is clear. The last person to remove a lock informs the control room before the pump is restarted.
