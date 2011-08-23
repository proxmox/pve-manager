Ext.ns("PVE");

PVE.KVMConfig = Ext.extend(PVE.ConfigPanel, {

    initComponent : function() {
	var self = this;

	var vmid = self.confdata.id;
	var node = self.confdata.node || 'localhost';

	if (!vmid) 
	    throw "no vmid specified";

	Ext.apply(self, {
	    title: "Virtual machine 'KVM " + vmid + " on node " + node + "'",
	    layout: 'fit',
  	    border: false,
	    items: [
		{
		    title: 'Summary',
		    id: 'summary',
		    tbar: [ 
			{ text: 'Start'}, 
			{ text: 'Stop'}, 
			{ text: 'Reset'}, 
			{ text: 'Shutdown'}, 
			{ text: 'Remove'}
		    ],
		    html: 'summary ' + vmid
		},
		{
		    title: 'Hardware',
		    id: 'hardware',
		    html: 'hardware ' + vmid
		},
		{
		    title: 'Options',
		    id: 'options',
		    html: 'options ' + vmid
		},
		{
		    xtype: 'pveConsole',
		    title: 'Console',
		    id: 'console',
		    vmid: vmid,
		    node: node,
		    border: false
		},
		{
		    title: 'Permissions',
		    id: 'permissions',
		    html: 'permissions ' + vmid
		}

	    ]
	});

	PVE.KVMConfig.superclass.initComponent.call(self);
    }
});

Ext.reg('pveKVMConfig', PVE.KVMConfig);

