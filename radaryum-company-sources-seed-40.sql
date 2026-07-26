-- Radaryum company_sources seed: 40 industrial companies
-- Safe to run more than once.

INSERT INTO company_sources (
  company,
  normalized_company,
  sec_cik,
  sector,
  country,
  priority,
  active
) VALUES
('Honeywell','honeywell','773840','Industrial Automation / Aerospace','United States',95,1),
('Emerson','emerson','32604','Industrial Automation','United States',94,1),
('Eaton','eaton','1551182','Electrical Equipment','Ireland / United States',94,1),
('Rockwell Automation','rockwell automation','1024478','Industrial Automation','United States',94,1),
('Parker Hannifin','parker hannifin','76334','Motion and Control','United States',93,1),
('Illinois Tool Works','illinois tool works','49826','Industrial Products','United States',92,1),
('3M','3m','66740','Industrial Materials','United States',92,1),
('Johnson Controls','johnson controls','833444','Building Technologies / HVAC','Ireland / United States',92,1),
('PACCAR','paccar','75362','Commercial Vehicles','United States',91,1),
('Caterpillar','caterpillar','18230','Heavy Equipment','United States',91,1),
('Deere & Company','deere company','315189','Agricultural Equipment','United States',91,1),
('Cummins','cummins','26172','Engines and Power Systems','United States',91,1),
('Carrier Global','carrier global','1783180','HVAC','United States',90,1),
('Trane Technologies','trane technologies','1466258','HVAC','Ireland / United States',90,1),
('Hubbell','hubbell','48898','Electrical Products','United States',90,1),
('Amphenol','amphenol','820313','Connectors and Electronics','United States',90,1),
('TE Connectivity','te connectivity','1385157','Connectors and Electronics','Switzerland / United States',90,1),
('Flex','flex','866374','Electronics Manufacturing Services','Singapore / United States',90,1),
('Jabil','jabil','898293','Electronics Manufacturing Services','United States',90,1),
('Lear','lear','842162','Automotive Components','United States',89,1),
('Aptiv','aptiv','1521332','Automotive Electronics','Ireland / United States',89,1),
('BorgWarner','borgwarner','908255','Automotive Components','United States',89,1),
('Magna International','magna international','749098','Automotive Components','Canada',89,1),
('Dana','dana','26780','Automotive Components','United States',88,1),
('Donaldson','donaldson','29644','Filtration','United States',88,1),
('Nordson','nordson','72331','Industrial Equipment','United States',88,1),
('Generac','generac','1474735','Power Equipment','United States',88,1),
('Pentair','pentair','77360','Water Equipment','Ireland / United States',88,1),
('Stanley Black & Decker','stanley black decker','93556','Tools and Industrial Products','United States',88,1),
('Dover','dover','29905','Industrial Equipment','United States',88,1),
('Xylem','xylem','1524472','Water Technology','United States',88,1),
('Ingersoll Rand','ingersoll rand','1699150','Industrial Equipment','United States',87,1),
('AMETEK','ametek','1037868','Electronic Instruments','United States',87,1),
('W.W. Grainger','ww grainger','277135','Industrial Distribution','United States',86,1),
('Fastenal','fastenal','815556','Industrial Distribution','United States',86,1),
('United Rentals','united rentals','1067701','Industrial Equipment Rental','United States',85,1),
('CNH Industrial','cnh industrial','1567094','Agricultural and Construction Equipment','United Kingdom / United States',85,1),
('Terex','terex','97216','Industrial Machinery','United States',85,1),
('AGCO','agco','880266','Agricultural Equipment','United States',85,1),
('Air Products','air products','2969','Industrial Gases','United States',85,1)
ON CONFLICT(normalized_company) DO UPDATE SET
  company = excluded.company,
  sec_cik = excluded.sec_cik,
  sector = excluded.sector,
  country = excluded.country,
  priority = excluded.priority,
  active = excluded.active,
  updated_at = CURRENT_TIMESTAMP;

-- Verification
SELECT
  company,
  sec_cik,
  sector,
  country,
  priority,
  active
FROM company_sources
ORDER BY priority DESC, company;
