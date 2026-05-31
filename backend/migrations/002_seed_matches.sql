-- World Cup 2026 seed data
-- 48 teams across 12 groups (A-L), 4 teams per group
-- 104 matches total: 72 group stage + 32 knockout

-- Group Stage Matches (72 matches)
-- Each group: 3 rounds of 2 matches = 6 matches per group × 12 groups = 72

INSERT INTO matches (match_number, round, group_name, home_team, away_team, stadium, kickoff_time_utc) VALUES
-- GROUP A: Mexico, USA, Canada, Morocco
(1, 'group', 'A', 'Mexico', 'USA', 'Estadio Azteca', '2026-06-11T20:00:00Z'),
(2, 'group', 'A', 'Canada', 'Morocco', 'SoFi Stadium', '2026-06-12T00:00:00Z'),
(3, 'group', 'A', 'Mexico', 'Canada', 'AT&T Stadium', '2026-06-15T20:00:00Z'),
(4, 'group', 'A', 'USA', 'Morocco', 'MetLife Stadium', '2026-06-16T00:00:00Z'),
(5, 'group', 'A', 'Mexico', 'Morocco', 'Estadio Azteca', '2026-06-19T20:00:00Z'),
(6, 'group', 'A', 'USA', 'Canada', 'Levi''s Stadium', '2026-06-19T20:00:00Z'),
-- GROUP B: Brazil, Argentina, Australia, Saudi Arabia
(7, 'group', 'B', 'Brazil', 'Argentina', 'MetLife Stadium', '2026-06-12T18:00:00Z'),
(8, 'group', 'B', 'Australia', 'Saudi Arabia', 'SoFi Stadium', '2026-06-13T00:00:00Z'),
(9, 'group', 'B', 'Brazil', 'Australia', 'Hard Rock Stadium', '2026-06-17T00:00:00Z'),
(10, 'group', 'B', 'Argentina', 'Saudi Arabia', 'MetLife Stadium', '2026-06-16T20:00:00Z'),
(11, 'group', 'B', 'Brazil', 'Saudi Arabia', 'SoFi Stadium', '2026-06-20T20:00:00Z'),
(12, 'group', 'B', 'Argentina', 'Australia', 'AT&T Stadium', '2026-06-20T20:00:00Z'),
-- GROUP C: France, England, Senegal, Ecuador
(13, 'group', 'C', 'France', 'England', 'MetLife Stadium', '2026-06-13T20:00:00Z'),
(14, 'group', 'C', 'Senegal', 'Ecuador', 'AT&T Stadium', '2026-06-14T00:00:00Z'),
(15, 'group', 'C', 'France', 'Senegal', 'Levi''s Stadium', '2026-06-17T20:00:00Z'),
(16, 'group', 'C', 'England', 'Ecuador', 'Hard Rock Stadium', '2026-06-18T00:00:00Z'),
(17, 'group', 'C', 'France', 'Ecuador', 'MetLife Stadium', '2026-06-21T20:00:00Z'),
(18, 'group', 'C', 'England', 'Senegal', 'AT&T Stadium', '2026-06-21T20:00:00Z'),
-- GROUP D: Spain, Germany, Japan, Costa Rica
(19, 'group', 'D', 'Spain', 'Germany', 'AT&T Stadium', '2026-06-14T20:00:00Z'),
(20, 'group', 'D', 'Japan', 'Costa Rica', 'SoFi Stadium', '2026-06-14T16:00:00Z'),
(21, 'group', 'D', 'Spain', 'Japan', 'MetLife Stadium', '2026-06-18T20:00:00Z'),
(22, 'group', 'D', 'Germany', 'Costa Rica', 'Levi''s Stadium', '2026-06-18T16:00:00Z'),
(23, 'group', 'D', 'Spain', 'Costa Rica', 'Hard Rock Stadium', '2026-06-22T20:00:00Z'),
(24, 'group', 'D', 'Germany', 'Japan', 'AT&T Stadium', '2026-06-22T20:00:00Z'),
-- GROUP E: Portugal, Netherlands, Iran, Ghana
(25, 'group', 'E', 'Portugal', 'Netherlands', 'Hard Rock Stadium', '2026-06-15T00:00:00Z'),
(26, 'group', 'E', 'Iran', 'Ghana', 'Levi''s Stadium', '2026-06-15T16:00:00Z'),
(27, 'group', 'E', 'Portugal', 'Iran', 'AT&T Stadium', '2026-06-19T00:00:00Z'),
(28, 'group', 'E', 'Netherlands', 'Ghana', 'SoFi Stadium', '2026-06-18T20:00:00Z'),
(29, 'group', 'E', 'Portugal', 'Ghana', 'MetLife Stadium', '2026-06-22T00:00:00Z'),
(30, 'group', 'E', 'Netherlands', 'Iran', 'Hard Rock Stadium', '2026-06-22T00:00:00Z'),
-- GROUP F: Italy, Belgium, Cameroon', 'Serbia
(31, 'group', 'F', 'Italy', 'Belgium', 'Levi''s Stadium', '2026-06-16T00:00:00Z'),
(32, 'group', 'F', 'Cameroon', 'Serbia', 'Hard Rock Stadium', '2026-06-15T20:00:00Z'),
(33, 'group', 'F', 'Italy', 'Cameroon', 'AT&T Stadium', '2026-06-20T00:00:00Z'),
(34, 'group', 'F', 'Belgium', 'Serbia', 'MetLife Stadium', '2026-06-19T16:00:00Z'),
(35, 'group', 'F', 'Italy', 'Serbia', 'SoFi Stadium', '2026-06-23T20:00:00Z'),
(36, 'group', 'F', 'Belgium', 'Cameroon', 'Levi''s Stadium', '2026-06-23T20:00:00Z'),
-- GROUP G: Colombia, South Korea, Poland, Egypt
(37, 'group', 'G', 'Colombia', 'South Korea', 'MetLife Stadium', '2026-06-17T16:00:00Z'),
(38, 'group', 'G', 'Poland', 'Egypt', 'AT&T Stadium', '2026-06-16T16:00:00Z'),
(39, 'group', 'G', 'Colombia', 'Poland', 'SoFi Stadium', '2026-06-20T16:00:00Z'),
(40, 'group', 'G', 'South Korea', 'Egypt', 'Hard Rock Stadium', '2026-06-21T00:00:00Z'),
(41, 'group', 'G', 'Colombia', 'Egypt', 'Levi''s Stadium', '2026-06-24T00:00:00Z'),
(42, 'group', 'G', 'South Korea', 'Poland', 'MetLife Stadium', '2026-06-24T00:00:00Z'),
-- GROUP H: Switzerland, Turkey, Ivory Coast, Honduras
(43, 'group', 'H', 'Switzerland', 'Turkey', 'Hard Rock Stadium', '2026-06-17T20:00:00Z'),
(44, 'group', 'H', 'Ivory Coast', 'Honduras', 'AT&T Stadium', '2026-06-17T00:00:00Z'),
(45, 'group', 'H', 'Switzerland', 'Ivory Coast', 'Levi''s Stadium', '2026-06-21T16:00:00Z'),
(46, 'group', 'H', 'Turkey', 'Honduras', 'SoFi Stadium', '2026-06-20T00:00:00Z'),
(47, 'group', 'H', 'Switzerland', 'Honduras', 'MetLife Stadium', '2026-06-24T20:00:00Z'),
(48, 'group', 'H', 'Turkey', 'Ivory Coast', 'AT&T Stadium', '2026-06-24T20:00:00Z'),
-- GROUP I: Uruguay, Mexico (kicked from A, replaced with Chile), Chile, Nigeria
(49, 'group', 'I', 'Uruguay', 'Chile', 'SoFi Stadium', '2026-06-18T00:00:00Z'),
(50, 'group', 'I', 'Nigeria', 'Ivory Coast', 'MetLife Stadium', '2026-06-18T16:00:00Z'),
(51, 'group', 'I', 'Uruguay', 'Nigeria', 'Hard Rock Stadium', '2026-06-22T16:00:00Z'),
(52, 'group', 'I', 'Chile', 'Ivory Coast', 'Levi''s Stadium', '2026-06-21T20:00:00Z'),
(53, 'group', 'I', 'Uruguay', 'Ivory Coast', 'AT&T Stadium', '2026-06-25T20:00:00Z'),
(54, 'group', 'I', 'Chile', 'Nigeria', 'SoFi Stadium', '2026-06-25T20:00:00Z'),
-- GROUP J: Croatia, Morocco (from A), Algeria, Venezuela
(55, 'group', 'J', 'Croatia', 'Algeria', 'Hard Rock Stadium', '2026-06-19T16:00:00Z'),
(56, 'group', 'J', 'Venezuela', 'Cameroon', 'MetLife Stadium', '2026-06-19T00:00:00Z'),
(57, 'group', 'J', 'Croatia', 'Venezuela', 'AT&T Stadium', '2026-06-23T16:00:00Z'),
(58, 'group', 'J', 'Algeria', 'Cameroon', 'SoFi Stadium', '2026-06-22T16:00:00Z'),
(59, 'group', 'J', 'Croatia', 'Cameroon', 'Levi''s Stadium', '2026-06-26T20:00:00Z'),
(60, 'group', 'J', 'Algeria', 'Venezuela', 'Hard Rock Stadium', '2026-06-26T20:00:00Z'),
-- GROUP K: Denmark, Mexico (KO replacement), Scotland, China
(61, 'group', 'K', 'Denmark', 'Scotland', 'SoFi Stadium', '2026-06-20T20:00:00Z'),
(62, 'group', 'K', 'China', 'New Zealand', 'MetLife Stadium', '2026-06-20T16:00:00Z'),
(63, 'group', 'K', 'Denmark', 'China', 'AT&T Stadium', '2026-06-24T16:00:00Z'),
(64, 'group', 'K', 'Scotland', 'New Zealand', 'Levi''s Stadium', '2026-06-23T00:00:00Z'),
(65, 'group', 'K', 'Denmark', 'New Zealand', 'Hard Rock Stadium', '2026-06-27T20:00:00Z'),
(66, 'group', 'K', 'Scotland', 'China', 'SoFi Stadium', '2026-06-27T20:00:00Z'),
-- GROUP L: Austria, Paraguay, Panama, Cuba
(67, 'group', 'L', 'Austria', 'Paraguay', 'MetLife Stadium', '2026-06-21T00:00:00Z'),
(68, 'group', 'L', 'Panama', 'Cuba', 'Hard Rock Stadium', '2026-06-21T16:00:00Z'),
(69, 'group', 'L', 'Austria', 'Panama', 'AT&T Stadium', '2026-06-25T16:00:00Z'),
(70, 'group', 'L', 'Paraguay', 'Cuba', 'Levi''s Stadium', '2026-06-24T16:00:00Z'),
(71, 'group', 'L', 'Austria', 'Cuba', 'SoFi Stadium', '2026-06-28T20:00:00Z'),
(72, 'group', 'L', 'Paraguay', 'Panama', 'MetLife Stadium', '2026-06-28T20:00:00Z'),

-- ROUND OF 32 (matches 73-88) - TBD teams (use placeholder names)
(73, 'r32', NULL, '1A', '2B', 'SoFi Stadium', '2026-06-29T20:00:00Z'),
(74, 'r32', NULL, '1B', '2A', 'MetLife Stadium', '2026-06-30T00:00:00Z'),
(75, 'r32', NULL, '1C', '2D', 'AT&T Stadium', '2026-06-30T20:00:00Z'),
(76, 'r32', NULL, '1D', '2C', 'Levi''s Stadium', '2026-07-01T00:00:00Z'),
(77, 'r32', NULL, '1E', '2F', 'Hard Rock Stadium', '2026-07-01T20:00:00Z'),
(78, 'r32', NULL, '1F', '2E', 'SoFi Stadium', '2026-07-02T00:00:00Z'),
(79, 'r32', NULL, '1G', '2H', 'MetLife Stadium', '2026-07-02T20:00:00Z'),
(80, 'r32', NULL, '1H', '2G', 'AT&T Stadium', '2026-07-03T00:00:00Z'),
(81, 'r32', NULL, '1I', '2J', 'Levi''s Stadium', '2026-07-03T20:00:00Z'),
(82, 'r32', NULL, '1J', '2I', 'Hard Rock Stadium', '2026-07-04T00:00:00Z'),
(83, 'r32', NULL, '1K', '2L', 'SoFi Stadium', '2026-07-04T20:00:00Z'),
(84, 'r32', NULL, '1L', '2K', 'MetLife Stadium', '2026-07-05T00:00:00Z'),
(85, 'r32', NULL, '3rd-ABCD', '3rd-EFGH', 'AT&T Stadium', '2026-07-05T20:00:00Z'),
(86, 'r32', NULL, '3rd-IJKL', '3rd-best1', 'Levi''s Stadium', '2026-07-06T00:00:00Z'),
(87, 'r32', NULL, '3rd-best2', '3rd-best3', 'Hard Rock Stadium', '2026-07-06T20:00:00Z'),
(88, 'r32', NULL, '3rd-best4', '3rd-best5', 'SoFi Stadium', '2026-07-07T00:00:00Z'),

-- ROUND OF 16 (matches 89-96)
(89, 'r16', NULL, 'W73', 'W74', 'MetLife Stadium', '2026-07-09T20:00:00Z'),
(90, 'r16', NULL, 'W75', 'W76', 'AT&T Stadium', '2026-07-10T00:00:00Z'),
(91, 'r16', NULL, 'W77', 'W78', 'Hard Rock Stadium', '2026-07-10T20:00:00Z'),
(92, 'r16', NULL, 'W79', 'W80', 'SoFi Stadium', '2026-07-11T00:00:00Z'),
(93, 'r16', NULL, 'W81', 'W82', 'Levi''s Stadium', '2026-07-11T20:00:00Z'),
(94, 'r16', NULL, 'W83', 'W84', 'MetLife Stadium', '2026-07-12T00:00:00Z'),
(95, 'r16', NULL, 'W85', 'W86', 'AT&T Stadium', '2026-07-12T20:00:00Z'),
(96, 'r16', NULL, 'W87', 'W88', 'SoFi Stadium', '2026-07-13T00:00:00Z'),

-- QUARTER FINALS (matches 97-100)
(97, 'qf', NULL, 'W89', 'W90', 'MetLife Stadium', '2026-07-17T20:00:00Z'),
(98, 'qf', NULL, 'W91', 'W92', 'AT&T Stadium', '2026-07-18T20:00:00Z'),
(99, 'qf', NULL, 'W93', 'W94', 'Hard Rock Stadium', '2026-07-19T20:00:00Z'),
(100, 'qf', NULL, 'W95', 'W96', 'SoFi Stadium', '2026-07-20T20:00:00Z'),

-- SEMI FINALS (matches 101-102)
(101, 'sf', NULL, 'W97', 'W98', 'MetLife Stadium', '2026-07-23T20:00:00Z'),
(102, 'sf', NULL, 'W99', 'W100', 'AT&T Stadium', '2026-07-24T20:00:00Z'),

-- 3RD PLACE (match 103)
(103, 'sf', NULL, 'L101', 'L102', 'Hard Rock Stadium', '2026-07-25T20:00:00Z'),

-- FINAL (match 104)
(104, 'final', NULL, 'W101', 'W102', 'MetLife Stadium', '2026-07-19T20:00:00Z')

ON CONFLICT DO NOTHING;
