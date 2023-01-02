import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as path from 'path'

export class LambdaVpcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const myRole = new iam.Role(this, 'My Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    myRole.attachInlinePolicy(new iam.Policy(this, 'eni-policy', {
      statements: [new iam.PolicyStatement({
        resources: ['arn:aws:logs:*:*:log-group:/aws/lambda/*'],
        actions: ["ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses"],
      })],
    }));

    const vpc = ec2.Vpc.fromLookup(this, "MyDefaultVpc", {
      isDefault: true,
      // vpcId: "vpc-0337e0f2837b5dce0"
    })

    // const securityGroup = new ec2.SecurityGroup(this, 'ENI-SG', {
    //   vpc: vpc,
    // })
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'SG', 'sg-18339745', {
      mutable: false
    });    

    const fn = new lambda.Function(this, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'hello.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-handler')),
      role: myRole, // user-provided role
      vpc: vpc,
      // 👇 place lambda in Private Subnets
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      allowPublicSubnet: true,
      // securityGroups: [securityGroup],
    });


// Temporary fix, https://github.com/aws/aws-cdk/issues/6701    
    const fixVpcDeletion = (handler: lambda.IFunction): void => {
      handler.connections.securityGroups.forEach(sg => {
        if (handler.role) {
          handler.role.node.children.forEach(child => {
            if (
              child.node.defaultChild &&
              (child.node.defaultChild as iam.CfnPolicy).cfnResourceType === 'AWS::IAM::Policy'
            ) {
              sg.node.addDependency(child);
            }
          });
        }
      });
    };
    
    fixVpcDeletion(fn);


    const account = new iam.AccountPrincipal('446761287601');
    // const account = new iam.AccountPrincipal('123456789012');

    fn.grantInvoke(account);

    myRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    myRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole")); // only required if your function lives in a VPC
  }
}
