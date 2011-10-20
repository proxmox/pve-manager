Ext.define('PVE.qemu.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.qemu.Config',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var vmname = me.pveSelNode.data.name;
	var descr = vmname ? "'" + vmname + "' " : '';
	Ext.apply(me, {
	    title: "Virtual machine " + descr + "'KVM " + vmid + 
		"' on node '" + nodename + "'",
	    hstateid: 'kvmtab',
	    items: [
		{
		    title: 'Summary',
		    xtype: 'pveQemuSummary',
		    itemId: 'summary'
		},
		{
		    title: 'Hardware',
		    itemId: 'hardware',
		    xtype: 'PVE.qemu.HardwareView'
		},
		{
		    title: 'Options',
		    itemId: 'options',
		    xtype: 'PVE.qemu.Options'
		},
		{
		    xtype: 'pveKVMConsole',
		    title: 'Console',
		    itemId: 'console',
		    //disabled: true,
		    nodename: nodename,
		    vmid: vmid
		},
		{
		    xtype: 'pveBackupView',
		    title: 'Backup',
		    itemId: 'backup'
		},
		{
		    title: 'Permissions',
		    itemId: 'permissions',
		    html: 'permissions ' + vmid
		}

	    ]
	});

	me.callParent();
   }
});
