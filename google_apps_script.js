// ============================================================
//   GOOGLE APPS SCRIPT v3
//   Removed: Bhada, Box Type
//   Added: Production Remarks, COD (Yes/No)
//   Paste into Extensions → Apps Script in your Google Sheet
// ============================================================

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Order No", "Date", "Party Name", "Location", "Loadcell Type",
        "Quantity", "Capacity", "Wire", "Laser/Logo Text", "Logo Image",
        "Production Remarks", "Transporter Name", "COD",
        "L.R. Number", "Tracking Link",
        "Order Remarks", "Wiring By", "Packing By", "Testing By", "Submitted At"
      ]);
      sheet.getRange(1, 1, 1, 20).setFontWeight("bold");
    }
    
    var imageUrl = "";
    if (data.logoImage && data.logoImage.length > 0) {
      try {
        var parts = data.logoImage.split(",");
        var mimeMatch = parts[0].match(/data:(.*?);/);
        var mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        var base64Data = parts.length > 1 ? parts[1] : parts[0];
        var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, data.orderNo + "_logo");
        var folders = DriveApp.getFoldersByName("Order Logos");
        var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("Order Logos");
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imageUrl = "https://drive.google.com/uc?id=" + file.getId();
      } catch (imgErr) { imageUrl = "Upload failed: " + imgErr.toString(); }
    }
    
    sheet.appendRow([
      data.orderNo, data.date, data.partyName, data.location,
      data.loadcellType, data.quantity, data.capacity, data.wire,
      data.laserLogo, imageUrl,
      data.productionRemarks, data.transporterName, data.transporterCOD,
      data.lrNumber, data.trackingLink,
      data.orderRemarks, data.wiringBy, data.packingBy, data.testingBy,
      new Date().toLocaleString()
    ]);
    
    var lastRow = sheet.getLastRow();
    if (imageUrl && !imageUrl.startsWith("Upload failed")) {
      sheet.getRange(lastRow, 10).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText("View Logo").setLinkUrl(imageUrl).build());
    }
    if (data.trackingLink) {
      sheet.getRange(lastRow, 15).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText("Track Shipment").setLinkUrl(data.trackingLink).build());
    }
    
    return ContentService.createTextOutput(JSON.stringify({status:"success"})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status:"error",message:error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
