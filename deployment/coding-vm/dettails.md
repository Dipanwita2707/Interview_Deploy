To check existing issues, please visit: https://github.com/Azure/azure-cli/issues
dipanwita [ ~ ]$ az vm create \
  --resource-group smart-platform-rg \
  --name smart-aural-vm \
  --image Ubuntu2204 \
  --admin-username azureuser \
  --generate-ssh-keys \
  --size Standard_D2s_v3 \
  --location centralindia
The default value of '--size' will be changed to 'Standard_D2s_v5' from 'Standard_DS1_v2' in a future release.
Consider upgrading security for your workloads using Azure Trusted Launch VMs. To know more about Trusted Launch, please visit https://aka.ms/TrustedLaunch.
{
  "fqdns": "",
  "id": "/subscriptions/d07f66ef-8015-4b57-b26d-32bfcadf0156/resourceGroups/smart-platform-rg/providers/Microsoft.Compute/virtualMachines/smart-aural-vm",
  "location": "centralindia",
  "macAddress": "7C-1E-52-32-8F-F5",
  "powerState": "VM running",
  "privateIpAddress": "10.0.0.4",
  "publicIpAddress": "4.224.31.8",
  "resourceGroup": "smart-platform-rg"
}
ipanwita [ ~ ]$ az vm create \
  --resource-group smart-platform-rg \
  --name smart-coding-vm \
  --image Ubuntu2204 \
  --admin-username azureuser \
  --generate-ssh-keys \
  --size Standard_D2s_v3 \
  --location centralindia
The default value of '--size' will be changed to 'Standard_D2s_v5' from 'Standard_DS1_v2' in a future release.
Consider upgrading security for your workloads using Azure Trusted Launch VMs. To know more about Trusted Launch, please visit https://aka.ms/TrustedLaunch.
{
  "fqdns": "",
  "id": "/subscriptions/d07f66ef-8015-4b57-b26d-32bfcadf0156/resourceGroups/smart-platform-rg/providers/Microsoft.Compute/virtualMachines/smart-coding-vm",
  "location": "centralindia",
  "macAddress": "70-A8-A5-A7-76-07",
  "powerState": "VM running",
  "privateIpAddress": "10.0.0.5",
  "publicIpAddress": "20.219.161.91",
  "resourceGroup": "smart-platform-rg"
}
dipanwita [ ~ ]$ 