Ext.define('PVE.qemu.Console', {
    extend: 'Ext.panel.Panel',

    alias: 'widget.pveQemuConsole',

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var myid = "vncconsole";

	var box = Ext.create('widget.uxiframe', {
		    id: myid
		});

	Ext.apply(me, {
	    layout: { type: 'fit' },
	    border: false,
	    items: box,
	    listeners: {
		show: function() {
		    box.load('/?console=kvm&novnc=1&vmid='+ vmid + '&node=' + nodename + '&resize=scale');
		}
	    }
	});		

	me.callParent();
    }
});
