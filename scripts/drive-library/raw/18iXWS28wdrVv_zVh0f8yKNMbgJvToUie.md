                      ​Adit Pozative(Server) App Installation Process​

​Information required for installation​
   ​​ A
   ●    ​ dit Pozative app should be installed only on server​
   ​●​ ​Must have Adit app credentials​



​System Requirements​
   ​​
   ●    ​ perating System: Windows Server 2008 R2 SP1 and higher​
        O
   ​●​  ​Memory: 8 GB RAM​
    ​●​  ​CPU: 4 cores at 2.4 GHz​
     ​●​  ​Local Drive Install Space:At least 10 GB on C: Drive (or where the practice management​
           ​software is located)​
   ​●​ ​Internet Speed:​
                ​○​ ​Download Speed: 10mbps​
                 ​○​ ​Upload Speed: 3mbps​


​Installation Steps​
   ​​ G
   ●    ​ o to the​​Link​​& download Pozative Sync Service Setup.​
   ​●​ ​Right click on Pozative > Properties > Unblock (if available) > OK..​
    ​●​ ​Install Pozative through right click on Pozative.exe > Run as an administrator > Enter​
        ​Adit app credentials :​
​Note :​
    ​1.​ ​If OpenDental has Root password then it needs to be entered while installation:​




    ​2.​ ​In Dentrix, it may ask for Dentrix Pass Phrase for Adit pdf upload:​
​3.​ ​In Abledent, server name should be the same as “Device Name” highlighted with​
      ​an arrow symbol. Also keep the password section blank and proceed further for​
       ​installation:​
​●​ ​PMS will automatically capture > Select Location > Save.​




   ​ ote - In-case multiple PMS installed on the server then need to select appropriate PMS​
   N
   ​to sync with Adit.​
​●​ ​Enter Server Administrator password or select any user id having administrator access :​




​●​ ​Now we will have the Pozative icon in the​​System Tray​
​●​ O
    ​ pen Pozative again via​​System Tray​​and take a screenshot of the Adit module Sync​
    ​configured successfully. Ensure the Appointment Log should be there while taking a​
     ​screenshot.​




​​ T
●    ​ ake the Screenshot of Task Manager with the System Performance (CPU Usage).​
​●​ ​Take the screenshot of the Adit app EHR page. Open location under admin.adit.com >​
     ​Settings > Select Location > EHR​
​Configure Pozative in Task Scheduler:​
​ onfiguration will be done automatically after input administrator password during installation.​
C
​For reference the setup should be :​
   ​●​ C
       ​ heck Task Scheduler > Click on Library > Double click on Pozative > Click on the​
       ​triggers tab > Double click on the trigger > Change the time to 8:00:00 AM > Repeat​
        ​Task every "2 hours" > For Duration of > Click on the dropdown > Choose indefinitely >​
         ​Click OK​




   ​​ C
   ●     ​ lick Settings Tab > Last drop down should be "Do not start a new instance"​
   ​●​ ​Task scheduler should be run through Administrator account only.​
    ​●​ ​Task Scheduler history should be enabled.​
​Configure PozativeAppStatus Service:​
​ onfiguration will be done automatically after input administrator password during installation.​
C
​For reference the setup should be run through Administrator account:​
   ​●​ O
       ​ pen Services.msc > Choose Pozative app status double click > Click on Log on >​
       ​Should run through administrator credentials:​




​Keep Server System Awlays ON:​
I​t’s mandatory that the server computer should be up & running during office hours, non office​
 ​hours and holidays to ensure the EHR data is kept synchronized with the Adit application. In​
  ​case the server computer is shut down or disconnected due to certain reasons then the​
   ​integration between PMS and Adit application will also stop. In consequence all the scheduled​
    ​events will stop running and upcoming reminders may not go out on a timely basis.​
