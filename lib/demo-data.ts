import type { Campaign, CampaignReport } from '@/types'

export const DEMO_CAMPAIGNS: Campaign[] = [
  { id:1, name:'1Life BMI AI V4.2',               agent:'seeker',  status:'running', dialing_speed:2, time_window_start:'08:00', time_window_end:'20:00' },
  { id:2, name:'1Life Funeral BMI AI V4.3',        agent:'grace',   status:'running', dialing_speed:1, time_window_start:'08:00', time_window_end:'20:00' },
  { id:3, name:'3Way Miway STI AI NEW',            agent:'sangoma', status:'running', dialing_speed:2, time_window_start:'08:00', time_window_end:'20:00' },
  { id:4, name:'Miway STI UGOC AI V4.3 Male',      agent:'seeker',  status:'paused',  dialing_speed:2, time_window_start:'08:00', time_window_end:'20:00' },
  { id:5, name:'Ivyze STI Old Mutual Vantage Male', agent:'grace',   status:'running', dialing_speed:1, time_window_start:'08:00', time_window_end:'20:00' },
  { id:6, name:'Metropolitan Funeral UGOC AI V4.3', agent:'sangoma', status:'paused',  dialing_speed:1, time_window_start:'08:00', time_window_end:'20:00' },
]

export const DEMO_REPORTS: CampaignReport[] = [
  { id:1, campaign_id:1, phone_number:'+27 82 123 4567', status:'connected', dialed:117728, connected:17853, qualified:43,  voicemail:30568, no_speech:10668, hangup:14137, ni:188,  dnq:170, callback:62,  no_answer:36189,  busy_line:11052, failed:14545, duration:'101:03:03', cpl:35.96,  total_spent:1546.08,  campaign:{name:'1Life BMI AI V4.2',               agent:'seeker'}  },
  { id:2, campaign_id:2, phone_number:'+27 71 987 6543', status:'voicemail', dialed:117190, connected:18223, qualified:59,  voicemail:30528, no_speech:10778, hangup:10666, ni:209,  dnq:144, callback:64,  no_answer:35907,  busy_line:11230, failed:13741, duration:'102:37:16', cpl:26.61,  total_spent:1570.10,  campaign:{name:'1Life Funeral BMI AI V4.3',        agent:'grace'}   },
  { id:3, campaign_id:3, phone_number:'+27 63 456 7890', status:'no_answer', dialed:112004, connected:21020, qualified:32,  voicemail:29420, no_speech:8928,  hangup:17612, ni:302,  dnq:79,  callback:119, no_answer:27639,  busy_line:8644,  failed:19141, duration:'124:14:20', cpl:59.40,  total_spent:1900.86,  campaign:{name:'3Way Miway STI AI NEW',            agent:'sangoma'} },
  { id:4, campaign_id:4, phone_number:'+27 83 321 0987', status:'connected', dialed:348886, connected:64408, qualified:48,  voicemail:63267, no_speech:38064, hangup:47766, ni:405,  dnq:113, callback:112, no_answer:121703, busy_line:44834, failed:32335, duration:'298:42:55', cpl:95.22,  total_spent:4570.34,  campaign:{name:'Miway STI UGOC AI V4.3 Male',      agent:'seeker'}  },
  { id:5, campaign_id:5, phone_number:'+27 72 654 3210', status:'connected', dialed:242162, connected:41806, qualified:30,  voicemail:71316, no_speech:17844, hangup:36020, ni:2189, dnq:291, callback:680, no_answer:53673,  busy_line:21409, failed:38568, duration:'254:43:36', cpl:129.91, total_spent:3897.32,  campaign:{name:'Ivyze STI Old Mutual Vantage Male', agent:'grace'}   },
  { id:6, campaign_id:6, phone_number:'+27 61 789 0123', status:'hangup',    dialed:121468, connected:19418, qualified:66,  voicemail:28875, no_speech:11360, hangup:15473, ni:330,  dnq:125, callback:101, no_answer:39271,  busy_line:12428, failed:13359, duration:'132:16:42', cpl:30.66,  total_spent:2023.86,  campaign:{name:'Metropolitan Funeral UGOC AI V4.3', agent:'sangoma'} },
]
