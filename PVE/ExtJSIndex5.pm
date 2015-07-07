package PVE::ExtJSIndex5;

use strict;
use warnings;

sub get_index {
    my ($lang, $username, $csrftoken, $console) = @_;

    my $page = <<_EOD;
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>Proxmox Virtual Environment</title>
 
    <link rel="stylesheet" type="text/css" href="/pve2/ext5/packages/ext-theme-neptune/build/resources/ext-theme-neptune-all.css" />
    <link rel="stylesheet" type="text/css" href="/pve2/css/ext-pve.css" />
_EOD

    my $langfile = "/usr/share/pve-manager/locale/pve-lang-${lang}.js";
    if (-f $langfile) {
	$page .= "<script type='text/javascript' src='/pve2/locale/pve-lang-${lang}.js'></script>";
    } else {
	$page .= '<script type="text/javascript">function gettext(buf) { return buf; }</script>';
    }

    $page .= <<_EOD;
    <script type="text/javascript" src="/pve2/ext5/ext-all-debug.js"></script>

    <script type="text/javascript" src="/pve2/manager5/Utils.js"></script>
    <script type="text/javascript" src="/pve2/manager5/Toolkit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/Parser.js"></script>
    <script type="text/javascript" src="/pve2/manager5/StateProvider.js"></script>
    <script type="text/javascript" src="/pve2/manager5/button/Button.js"></script>
    <script type="text/javascript" src="/pve2/manager5/button/ConsoleButton.js"></script>
<!--
    <script type="text/javascript" src="/pve2/manager5/qemu/SendKeyMenu.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/CmdMenu.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/TemplateMenu.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/CmdMenu.js"></script>
-->
    <script type="text/javascript" src="/pve2/manager5/VNCConsole.js"></script>
    <script type="text/javascript" src="/pve2/manager5/data/TimezoneStore.js"></script>
    <script type="text/javascript" src="/pve2/manager5/data/reader/JsonObject.js"></script>
    <script type="text/javascript" src="/pve2/manager5/data/PVEProxy.js"></script>
    <script type="text/javascript" src="/pve2/manager5/data/UpdateQueue.js"></script>
    <script type="text/javascript" src="/pve2/manager5/data/UpdateStore.js"></script>
    <script type="text/javascript" src="/pve2/manager5/data/DiffStore.js"></script>
    <script type="text/javascript" src="/pve2/manager5/data/ObjectStore.js"></script>
    <script type="text/javascript" src="/pve2/manager5/data/ResourceStore.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/VLanField.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/Checkbox.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/TextField.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/RRDTypeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/ComboGrid.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/KVComboBox.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/Boolean.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/CompressionSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/PoolSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/GroupSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/UserSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/RoleSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/VMIDSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/MemoryField.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/NetworkCardSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/DiskFormatSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/BusTypeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/ControllerSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/EmailNotificationSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/RealmComboBox.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/BondModeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/ViewSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/NodeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/FileSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/StorageSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/BridgeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/SecurityGroupSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/IPRefSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/IPProtocolSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/CPUModelSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/VNCKeyboardSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/LanguageSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/DisplaySelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/CacheTypeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/SnapshotSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/ContentTypeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/HotplugFeatureSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/iScsiProviderSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/DayOfWeekSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/BackupModeSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/ScsiHwSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/form/FirewallPolicySelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/Tasks.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/Log.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/StatusPanel.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/RRDView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/InputPanel.js"></script>
    <script type="text/javascript" src="/pve2/manager5/window/Edit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/window/LoginWindow.js"></script>
    <script type="text/javascript" src="/pve2/manager5/window/TaskViewer.js"></script>
    <script type="text/javascript" src="/pve2/manager5/window/Wizard.js"></script>
    <script type="text/javascript" src="/pve2/manager5/window/NotesEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/window/Backup.js"></script>
    <script type="text/javascript" src="/pve2/manager5/window/Restore.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/NotesView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/CheckColumn.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/SelectFeature.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/ObjectGrid.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/PendingObjectGrid.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/ResourceGrid.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/PoolMembers.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/FirewallRules.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/FirewallAliases.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/FirewallOptions.js"></script>
    <script type="text/javascript" src="/pve2/manager5/tree/ResourceTree.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/IPSet.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/ConfigPanel.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/SubConfigPanel.js"></script>
    <script type="text/javascript" src="/pve2/manager5/grid/BackupView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/LogView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/panel/Firewall.js"></script>
<!--
    <script type="text/javascript" src="/pve2/manager5/ceph/Pool.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ceph/OSD.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ceph/Disks.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ceph/Monitor.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ceph/Crush.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ceph/Status.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ceph/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/DNSEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/DNSView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/TimeView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/TimeEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/ServiceView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/NetworkEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/NetworkView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/Tasks.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/Subscription.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/APT.js"></script>
    <script type="text/javascript" src="/pve2/manager5/node/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/StatusView.js"></script>
-->
    <script type="text/javascript" src="/pve2/manager5/window/Migrate.js"></script>
    <script type="text/javascript" src="/pve2/manager5/window/MigrateAll.js"></script>
<!--
    <script type="text/javascript" src="/pve2/manager5/qemu/Monitor.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/OSTypeEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/ProcessorEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/BootOrderEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/MemoryEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/NetworkEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/Smbios1Edit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/CDEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/HDEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/HDResize.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/HDMove.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/HDThrottle.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/CPUOptions.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/DisplayEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/KeyboardEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/HardwareView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/StartupEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/ScsiHwEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/Options.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/Snapshot.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/Clone.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/SnapshotTree.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager5/qemu/CreateWizard.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/Network.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/Resources.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/Options.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/DNS.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager5/lxc/CreateWizard.js"></script>
-->
    <script type="text/javascript" src="/pve2/manager5/pool/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/pool/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager5/pool/Config.js"></script>
<!--
    <script type="text/javascript" src="/pve2/manager5/storage/ContentView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/Browser.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/DirEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/NFSEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/GlusterFsEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/IScsiEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/LVMEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/RBDEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/SheepdogEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/ZFSEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/storage/ZFSPoolEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ha/StatusView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ha/GroupSelector.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ha/ResourceEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ha/Resources.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ha/GroupEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ha/Groups.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ha/Fencing.js"></script>
    <script type="text/javascript" src="/pve2/manager5/ha/Config.js"></script>
-->
    <script type="text/javascript" src="/pve2/manager5/dc/Summary.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/OptionView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/StorageView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/UserEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/UserView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/PoolView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/PoolEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/GroupView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/GroupEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/RoleView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/ACLView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/AuthView.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/AuthEdit.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/Backup.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/Support.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/SecurityGroups.js"></script>
    <script type="text/javascript" src="/pve2/manager5/dc/Config.js"></script>
    <script type="text/javascript" src="/pve2/manager5/Workspace.js"></script>
_EOD

    my $jssrc = <<_EOJS;
if (typeof(PVE) === 'undefined') PVE = {};
PVE.UserName = '$username'
PVE.CSRFPreventionToken = '$csrftoken';
_EOJS

    my $workspace = defined($console) ?
	"PVE.ConsoleWorkspace" : "PVE.StdWorkspace";

   $jssrc .= <<_EOJS;
// we need this (the java applet ignores the zindex)
Ext.useShims = true;
Ext.History.fieldid = 'x-history-field';
Ext.onReady(function() { 
	console.log(Ext.getVersion().version);
	Ext.create('$workspace');
});
_EOJS

    $page .= <<_EOD;
    <script type="text/javascript">$jssrc</script>
    
  </head>
  <body>
    <!-- Fields required for history management -->
    <form id="history-form" class="x-hidden">
    <input type="hidden" id="x-history-field"/>
    </form>
  </body>
</html>
_EOD
   
    return $page;

}

1;
