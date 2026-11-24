import type { MachineReadableReport } from "../cli/cli-types";

export interface ScanHistoryRecord {
    id: string;
    timestamp: string;
    repositoryPath: string;
    fileCount: number;
    healthScore: number;
    securityScore: number;
    criticalFindings: number;
    circularDependencies: number;
    report: MachineReadableReport;
}

export interface HistoryComparison {
    previousScan: ScanHistoryRecord | null;
    currentScan: ScanHistoryRecord;
    fileCountDiff: number;
    healthScoreDiff: number;
    newFindingsCount: number;
    resolvedFindingsCount: number;
}
