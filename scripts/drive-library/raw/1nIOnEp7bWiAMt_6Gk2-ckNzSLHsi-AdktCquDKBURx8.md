# Adit Patient Forms Configuration Guide

## Overview

Adit Patient Forms provide powerful tools for collecting patient information and integrating it directly with your EHR/PMS. This guide covers the key configuration options available within Patient Forms, including field mapping, clinical data integration, PDF settings, auto-import, EHR folder selection, and pre-fill functionality.

---

# 1\. Mapping Fields in the Form to the EHR

## What Is PMS Field Mapping?

PMS Field Mapping connects fields within your Patient Form to corresponding fields in your EHR. Once a patient completes a form and it is approved, the mapped information automatically updates the patient's chart.

### Benefits

* Reduces manual data entry.  
* Improves data accuracy.  
* Keeps patient records updated automatically.

## Available PMS Mapping Fields

### Patient Demographics

* Patient First Name  
* Patient Last Name  
* Date of Birth (DOB)  
* Preferred Name  
* Gender  
* Marital Status  
* Social Security Number (SSN)  
* Driver’s License Number

### Contact Information

* Address Line 1  
* Address Line 2  
* City  
* State  
* Zip Code  
* Email Address  
* Home Phone Number  
* Work Phone Number  
* Mobile Phone Number

### Insurance Information

* Primary Insurance Company Name  
* Secondary Insurance Company Name  
* Primary Insurance ID  
* Secondary Insurance ID

### Clinical Custom Fields

* Medications  
* Allergies  
* Problems

    
    
  

### Important Notes

* Available mapping fields may vary based on your EHR integration.  
* Clinical fields sync only when selected from the predefined dropdown lists.  
* Information writes back to the patient chart after form approval.  
* Proper mapping ensures accurate and automatic record updates.

---

---

# 2\. Choosing the PDF Compression Layout

Adit Patient Forms provide multiple PDF layout options for downloaded forms.

## Important

Changing the PDF layout affects only the downloaded PDF. The online patient experience remains unchanged.

## How to Change the PDF Layout

### Step 1: Access form manager 

1. Navigate to Patient Forms.

   

2. Open form manager .  
3. Select the desired form.  
     
   

### Step 2: Choose a Layout

1. Click the Download dropdown.  
2. Select your preferred PDF layout.

   

## Available PDF Layouts

### Compressed Layout

* Minimizes file size.  
* Removes unnecessary whitespace.  
* Ideal for storage efficiency.  
  

### Table Layout

* Place each field within its own table cell.  
* Provides a structured and organized appearance.  
* Useful for documentation and record review.

  

### Large Print Layout

* Closely matches the online form design.  
* Provides larger spacing and improved readability.  
* Ideal for reviewing detailed responses.

  1. 

### Important Notes

* Layout changes only affect downloaded PDFs.  
* Patient-facing forms remain unchanged.  
* Layouts can be switched at any time before downloading.

---

# 3\. Toggling Auto-Import ON or OFF

Auto-Import automatically transfers completed forms to the connected EHR/PMS, including uploading the PDF and updating mapped fields.

## Benefits

* Eliminates manual importing.  
* Reduces administrative workload.  
* Speeds up patient record updates.

## When Auto-Import Works

Auto-Import is available only when forms are sent through:

* Quick Text  
* Form Requests  
* Auto-Assign Rules

A specific patient must be selected.

## When Auto-Import Does Not Work

Forms completed through a public URL cannot be auto-imported and must be manually matched and imported.

## How to Enable or Disable Auto-Import

### Option 1: From Form Manager

1. Navigate to Patient Forms.  
2. Open Form Manager.  
3. Locate the form.  
4. Toggle Auto-Import ON or OFF.  
   

### Option 2: Within the Form

1. Open the form for editing.  
2. Locate the Auto-Import setting.  
3. Enable or disable the feature.  
4. Save your changes.  
   

### Summary

When enabled, Adit automatically imports the completed PDF into the patient's PMS record and updates mapped fields. Auto-Import is available only for forms sent through Form Requests, Quick Text, or Auto-Assign workflows.

---

#   4\. Selecting the Folder in the EHR for Completed Form Uploads

Practices can specify which EHR folder receives completed form PDFs after import.

## Why Use Folder Selection?

* Keeps records organized.  
* Supports office-specific workflows.  
* Ensures forms are stored in the correct chart location.

## Important Notes

* Folders are created and managed within the EHR.  
* New folders must be created in the EHR before they become available in Adit.  
* Folder availability depends on EHR synchronization.

## How to Select an EHR Folder

### Option 1: From Form Manager

1. Navigate to Patient Forms.  
2. Open Form Manager.  
3. Locate the form.  
4. Select the desired EHR Folder.  
   

### Option 2: Within the Form

1. Edit the form.  
2. Locate the EHR Folder setting.  
3. Select the appropriate folder.  
4. Save your changes.  
   

## Result

After configuration, all completed and imported form PDFs will be uploaded automatically to the selected folder within the patient’s EHR chart.

---

# 5\. Setting Fields as Pre-Fill Fields

Pre-Fill Fields allow staff to populate specific form fields before sending the form to a patient.

## Benefits

* Reduces patient data entry.  
* Ensures critical information is already included.  
* Supports internal workflow requirements.

  Supported Field Types  
* Single Line Text  
* Date Fields  
* Multi-choice   
  checkboxes

## Important Limitations

* Pre-Fill fields cannot be marked as Required.  
* Patients cannot edit Pre-Fill fields.  
* Empty Pre-Fill fields remain blank after submission.

## Part 1: Setting Up a Pre-Fill Field

### Step 1: Open Form Manager

1. Navigate to Patient Forms.  
2. Open Form Manager.  
3. Edit the desired form.

### Step 2: Enable Pre-Fill

1. Select an existing Single Line Text or Date field.  
2. Enable the Pre-Fill Field toggle.  
3. Save the form.

   

The field is now configured for pre-fill functionality.

## Part 2: Entering Pre-Fill Information Before Sending

Pre-Fill fields can be completed when assigning forms through:

* Quick Text  
* Patient Card → Assign Form

### Pre-Fill Status Indicators

🟧 Orange Icon

* One or more Pre-Fill fields are incomplete.

🟩 Green Icon

* All Pre-Fill fields have been completed.

## Two Ways to Complete Pre-Fill Fields

### Option 1: Individual Entry

Best for a single form assignment.

1. Click the Pre-Fill icon.  
2. Enter the required information.  
3. Save.  
4. Send the form.  
     
   

### Option 2: Bulk Entry

Recommended for multiple form assignments.

1. Click Send or Assign.  
2. Complete all outstanding Pre-Fill fields from the review screen.  
3. Submit the forms.

## Key Reminders

* Only staff can edit Pre-Fill fields.  
* Patients cannot modify pre-filled information.  
* Empty Pre-Fill fields remain blank after submission.  
* Pre-Fill fields cannot be designated as required.

### Common Use Cases

* Appointment dates  
* Provider names  
* Internal reference numbers  
* Office-use-only information

---

# Conclusion

By properly configuring field mapping, clinical data integration, PDF layouts, Auto-Import settings, EHR folder destinations, and Pre-Fill fields, practices can streamline patient intake, reduce manual work, improve data accuracy, and maintain well-organized patient records within their EHR.

# 6\. Integrating Allergies, Medications, and Medical History into Your Forms  Add Allergies to Patient Forms

Patient allergies can easily be pulled from your EHR and be placed into Adit’s Patient Forms. When patients select an allergy in their form, that data will then be imported back into their patient chart.   
To add allergies to a patient form:

1. Navigate to the **Patient Forms** module.  
2. In the top navigation menu, click **Form Manager **.  If you don’t see this option in the menu, click the three dots  to view the rest of the menu options.  
3. Click the **Create Form** button to create a new form, or click **Form Name**, or  **Edit  icon** on an existing form you want to update.   
4. On the Form building page, you will see a tool bar on the left side. This tool bar provides different types of fields that you can use in your form.  
      
5. Go to the custom fields section and drag the **Allergies** field into your form.   
      
6. You’ll see a pop-up appear, explaining that this field will automatically populate a list of Allergies based on the master list in your EHR. Select **Yes** to continue.  
     
7. Once the field is placed on your form, the right hand column will appear showing the field properties.  
8.   
   1. **Field Label \-** Use this field to write the question you want to ask the patient  
      1. For Example: “Are you currently allergic to any of the following?”  
   2. **Hidden \-** you can hide this question on the patient form  
   3. **Required \-** you can make this field mandatory for patients  
   4. **Copy** \- this option is disabled for all custom fields because you can only have one in each form  
   5. **PMS Field \-** this field allows you to map where the data should write into your EHR. Since this is a custom field, it will be automatically mapped to the allergies in the patient’s chart.   
   6. **Allergy Name \-** these are automatically pulled based on the allergies available in your EHR.   
         
      1. You can choose to select the **Eye Icon**to hide an allergy from the dropdown or select the **X** to remove it completely.   
      2. Please note if you want to add any new allergies on this list, it will have to be added directly in your EHR first, and then once that information syncs over you have to remove and re-add this allergy field in your form.  
   7. **Reset \-** If you want to remove any updates you made to the medications field, you can select this buttonto start over.  
   8. Once you are satisfied with your form and are ready to start using it, go to the top navigation and select either **Save** or **Save & Exit**

# 

# Add Problems to Patient Forms

Patient problems can easily be pulled from your EHR and be placed into Adit’s Patient Forms. When patients select a problem in their form, that data will then be imported back into their patient chart.   
To add problems to a patient form:

1. Navigate to the **Patient Forms** module.  
2. In the top navigation menu, click **Form Manager **.  If you don’t see this option in the menu, click the three dots  to view the rest of the menu options.  
3. Click the **Create Form** button to create a new form, or click **Form Name**, or  **Edit  icon** on an existing form you want to update.   
4. On the Form building page, you will see a tool bar on the left side. This tool bar provides different types of fields that you can use in your form.  
      
5. Go to the custom fields section and drag the **Problems** field into your form.   
      
6. You’ll see a pop-up appear, explaining that this field will automatically populate a list of Problems based on the master list in your EHR. Select **Yes** to continue.  
     
7. Once the field is placed on your form, the right hand column will appear showing the field properties.  
8.   
   1. **Field Label \-** Use this field to write the question you want to ask the patient  
      1. For Example: “Do you currently have any of the following problems?”  
   2. **Hidden \-** you can hide this question on the patient form  
   3. **Required \-** you can make this field mandatory for patients  
   4. **Copy** \- this option is disabled for all custom fields because you can only have one in each form  
   5. **PMS Field \-** this field allows you to map where the data should write into your EHR. Since this is a custom field, it will be automatically mapped to the problems in the patient’s chart.   
   6. **Problem Name \-** these are automatically pulled based on the problems available in your EHR.   
         
      1. You can choose to select the **Eye Icon**to hide an allergy from the dropdown or select the **X** to remove it completely.   
      2. Please note if you want to add any new allergies on this list, it will have to be added directly in your EHR first, and then once that information syncs over you have to remove and re-add this allergy field in your form.  
   7. **Reset \-** If you want to remove any updates you made to the medications field, you can select this buttonto start over.  
   8. Once you are satisfied with your form and are ready to start using it, go to the top navigation and select either **Save** or **Save & Exit**

# Add Medications to Patient Forms

Patient medications can easily be pulled from your EHR and be placed into Adit’s Patient Forms. When patients select a medication in their form, that data will then be imported back into their patient chart.   
To add medications to a patient form:

1. Navigate to the **Patient Forms** module.    
2. In the top navigation menu, click **Form Manager **.  If you don’t see this option in the menu, click the three dots  to view the rest of the menu options.  
3. Click the **Create Form** button to create a new form, or click **Form Name**, or  **Edit  icon** on an existing form you want to update.   
4. On the Form manager page, you will see a tool bar on the left side. This tool bar provides different types of fields that you can use in your form.          
      
5. Go to the custom fields section and drag the **medications** field into your form.   
      
6. You’ll see a pop-up appear, explaining that this field will automatically populate a list of medications based on the master list in your EHR. Select **Yes** to continue  
        
   .  
     
7. Once the field is placed on your form, the right hand column will appear showing the field properties.  
     
     
   **Field Label \-** Use this field to write the question you want to ask the patient  
   1. For Example: “Are you currently taking any medications?”  
2. **Hidden \-** you can hide this question on the patient form  
3. **Required \-** you can make this field mandatory for patients to fill out  
4. **Copy** \- this option is disabled for all custom fields because you can only have one in each form  
5. **PMS Field \-** this field allows you to map where the data should write into your EHR. Since this is a custom field, it will be automatically mapped to the medications in the patient’s chart.   
6. **Medication Name \-** these are automatically pulled based on the medications available in your EHR. 

   1. You can choose to select the **Eye Icon**to hide a medication from the dropdown or select the **X** to remove it completely.   
   2. Please note if you want to add any medications on this list, it will have to be added directly in your EHR first, and then once that information syncs over you have to remove and re-add this medication field in your form.  
7. **Reset \-** If you want to remove any updates you made to the medications field, you can select this buttonto start over.  
8. Once you are satisfied with your form and are ready to start using it, go to the top navigation and select either **Save** or **Save & Exit**  
9. Now once you send a form request to a patient, this is how the medications field will look like from a patient’s perspective.  
10. Patients who have medications associated to their profile in the EHR will have the medications automatically pre-populated when they receive a form request.   
    1. Patients will also be able to enter in new medications by using either of these methods:  
         
       1. **Clicking on the dropdown and selecting from a list of predefined medications**  
          1. Note: medications selected from the dropdown will be imported over to the patient’s profile once the form is approved  
       2. **Manually entering in their own medication**   
          1. Note: medications manually entered in will **not** be imported over.   
    2. Patients can add more medications by clicking on **\+** or remove a medication by clicking on **X**

















































































































