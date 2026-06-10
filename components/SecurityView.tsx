import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Chip from '@mui/material/Chip'

const EVENT_COLOR: Record<string, 'error' | 'success' | 'primary'> = {
  unauthorized_access: 'error',
  login: 'success',
}

export default function SecurityView({ securityLogs }: { securityLogs: any[] }) {
  return (
    <Paper sx={{ overflow: 'auto' }}>
      <TableContainer>
        <Table size="small" sx={{ minWidth: 800 }}>
          <TableHead>
            <TableRow>
              {['Event', 'Agent', 'IP Address', 'Details', 'Timestamp'].map(h => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {securityLogs.map(log => (
              <TableRow key={log.id} hover>
                <TableCell>
                  <Chip label={log.event_type.replace('_', ' ').toUpperCase()} size="small" color={EVENT_COLOR[log.event_type] ?? 'primary'} variant="outlined" sx={{ fontSize: '0.65rem' }} />
                </TableCell>
                <TableCell sx={{ fontSize: '0.82rem' }}>{log.agent_name}</TableCell>
                <TableCell className="mono" sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>{log.ip_address}</TableCell>
                <TableCell sx={{ fontSize: '0.82rem' }}>{log.details}</TableCell>
                <TableCell sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>{new Date(log.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
