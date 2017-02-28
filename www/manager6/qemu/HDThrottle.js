Ext.define('PVE.qemu.HDThrottleInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.HDThrottleInputPanel',

    insideWizard: false,

    unused: false, // ADD usused disk imaged

    vmconfig: {}, // used to select usused disks

    onGetValues: function(values) {
	var me = this;

	var confid = me.confid;
	
        var names = ['mbps_rd', 'mbps_wr', 'iops_rd', 'iops_wr'];
        Ext.Array.each(names, function(name) {
            if (values[name]) {
                me.drive[name] = values[name];
            } else {
                delete me.drive[name];
            }
            var burst_name = name + '_max';
            if (values[burst_name] && values[name]) {
                me.drive[burst_name] = values[burst_name];
            } else {
                delete me.drive[burst_name];
            }
        });

	var params = {};
		
	params[confid] = PVE.Parser.printQemuDrive(me.drive);
	
	return params;	
    },

    setDrive: function(drive) {
	var me = this;

	me.drive = drive;

	var values = {};

	values.mbps_rd = drive.mbps_rd;
	values.mbps_wr = drive.mbps_wr;
	values.iops_rd = drive.iops_rd;
	values.iops_wr = drive.iops_wr;
	values.mbps_rd_max = drive.mbps_rd_max;
	values.mbps_wr_max = drive.mbps_wr_max;
	values.iops_rd_max = drive.iops_rd_max;
	values.iops_wr_max = drive.iops_wr_max;

	me.setValues(values);
    },

    initComponent : function() {
	var me = this;

	me.drive = {};

	me.column1 = [];
	me.column2 = [];

	var width2 = 140;

        me.mbps_rd = Ext.widget('numberfield', {
            name: 'mbps_rd',
            minValue: 1,
            step: 1,
            fieldLabel: gettext('Read limit') + ' (MB/s)',
            labelWidth: width2,
            emptyText: gettext('unlimited')
         });

        me.column1.push(me.mbps_rd);

        me.mbps_rd_max = Ext.widget('numberfield', {
            name: 'mbps_rd_max',
            minValue: 1,
            step: 1,
            fieldLabel: gettext('Read max burst') + ' (MB)',
            labelWidth: width2,
            emptyText: gettext('default')
        });

        me.column2.push(me.mbps_rd_max);


        me.mbps_wr = Ext.widget('numberfield', {
            name: 'mbps_wr',
            minValue: 1,
            step: 1,
            fieldLabel: gettext('Write limit') + ' (MB/s)',
            labelWidth: width2,
            emptyText: gettext('unlimited')
        });

        me.column1.push(me.mbps_wr);

        me.mbps_wr_max = Ext.widget('numberfield', {
            name: 'mbps_wr_max',
            minValue: 1,
            step: 1,
            fieldLabel: gettext('Write max burst') + ' (MB)',
            labelWidth: width2,
            emptyText: gettext('default')
        });

        me.column2.push(me.mbps_wr_max);

        me.iops_rd = Ext.widget('pveIntegerField', {
            name: 'iops_rd',
            minValue: 10,
            step: 10,
            fieldLabel: gettext('Read limit') + ' (ops/s)',
            labelWidth: width2,
            emptyText: gettext('unlimited')
        });

        me.column1.push(me.iops_rd);

        me.iops_rd_max = Ext.widget('pveIntegerField', {
            name: 'iops_rd_max',
            minValue: 10,
            step: 10,
            fieldLabel: gettext('Read max burst') + ' (ops)',
            labelWidth: width2,
            emptyText: gettext('default')
        });

        me.column2.push(me.iops_rd_max);

        me.iops_wr = Ext.widget('pveIntegerField', {
            name: 'iops_wr',
            minValue: 10,
            step: 10,
            fieldLabel: gettext('Write limit') + ' (ops/s)',
            labelWidth: width2,
            emptyText: gettext('unlimited')
        });

        me.column1.push(me.iops_wr);

        me.iops_wr_max = Ext.widget('pveIntegerField', {
            name: 'iops_wr_max',
            minValue: 10,
            step: 10,
            fieldLabel: gettext('Write max burst') + ' (ops)',
            labelWidth: width2,
            emptyText: gettext('default')
        });

        me.column2.push(me.iops_wr_max);

	me.callParent();
    }
});

Ext.define('PVE.qemu.HDThrottle', {
    extend: 'PVE.window.Edit',

    isAdd: true,

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) { 
	    throw "no node name specified";	    
	}

	var unused = me.confid && me.confid.match(/^unused\d+$/);
	
	me.isCreate = me.confid ? unused : true;

	var ipanel = Ext.create('PVE.qemu.HDThrottleInputPanel', {
	    confid: me.confid,
	    nodename: nodename
	});

	var subject;
	if (unused) {
	    me.subject = gettext('Unused Disk');
	} else {
           me.subject = gettext('Hard Disk') + ' (' + me.confid + ')';
	}

	me.items = [ ipanel ];

	me.callParent();
	
	me.load({
	    success: function(response, options) {
		if (me.confid) {
		    var value = response.result.data[me.confid];
		    var drive = PVE.Parser.parseQemuDrive(me.confid, value);
		    if (!drive) {
			Ext.Msg.alert(gettext('Error'), 'Unable to parse drive options');
			me.close();
			return;
		    }
		    ipanel.setDrive(drive);
		    me.isValid(); // trigger validation
		}
	    }
	});
    }
});
