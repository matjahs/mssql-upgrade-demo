# 🤖 The Agents of Change: GitOps Demo

Welcome to the GitOps demo! This project demonstrates how we manage infrastructure and databases using the same workflow developers use for code: **Git.**

In this demo, we aren't manually clicking buttons in a UI or running terminal commands. Instead, we use **Agents** to ensure our environment always matches our "Source of Truth" (GitHub).

---

## 👥 The Actors

| Agent | Role | Real-World Equivalent |
| :--- | :--- | :--- |
| **The Developer (You)** | Edits the configuration file. | The Architect |
| **GitHub** | Stores the desired state of the world. | The Blueprint |
| **The GitOps Operator** | Watches GitHub and Kubernetes 24/7. | The Diligent Foreman |
| **Kubernetes** | The platform where the SQL Server lives. | The Construction Site |

---

## 🛠 The Workflow: From SQL 2022 to 2025

To keep things simple, we are managing a **Single Instance MS SQL Server**. Our goal is to perform a version upgrade just by changing a single line of text.

### 1. The Starting State

Currently, our `sql-deployment.yaml` file tells the GitOps Agent to run **MS SQL 2022**.

```yaml
# Inside sql-deployment.yaml
spec:
  template:
    spec:
      containers:
      - name: mssql
        image: mcr.microsoft.com/mssql/server:2022-latest
```

### 2. The Change

We want to upgrade to MS SQL 2025. Instead of logging into a server or running a script, we simply update the code:

1. Open sql-deployment.yaml.
2. Change 2022-latest to 2025-latest.
3. Save the file.

### 3. The Hand-off (Commit & Push)

We "publish" our new blueprint to GitHub:

```shell
git add sql-deployment.yaml
git commit -m "Upgrade database to MS SQL 2025"
git push origin main
```

### 4. The Magic (Automated Reconciliation)

This is where the GitOps Agent (ArgoCD) takes over:

1. Detection: The Agent notices that the version in GitHub (2025) no longer matches the version running in the cluster (2022).
2. Action: The Agent automatically tells Kubernetes: "Hey, update this container to 2025 immediately."
3. Verification: The Agent waits until the new version is healthy and reports back that the system is "In Sync."

---

## 💡 Why does this matter?

1. No "Fat Finger" Errors: You don't run commands that can be mistyped.
2. Audit Trail: We can look at the GitHub history to see exactly who upgraded the database and when.
3. Self-Healing: If someone manually tries to change the database version back to 2022 via the command line, the Agent will see the conflict and automatically change it back to 2025 to match our code.

## 🏗 Level 2: The Agent as the General Contractor (Cluster-as-Code)

In the first part of our demo, we managed an application (SQL Server). But in a true GitOps environment, the Agent also builds the infrastructure itself. This is called Cluster-as-Code.

### 1. The Instruction

We don't go to the Omni UI and click "Create Cluster." Instead, we add an OmniCluster definition to our repository. This tells the Agent exactly how many nodes we want and what version of Kubernetes to use.

```yaml
# Inside omni-cluster-definition.yaml
apiVersion: api.omni.sidero.dev/v1alpha1
kind: OmniCluster
metadata:
  name: demo-cluster-01
spec:
  clusterName: gitops-managed-cluster
  kubernetesVersion: v1.30.1
  controlPlane:
    count: 1 # We start small for the demo
  workerNodes:
    count: 2
```

### 2. The Execution

When you push this file to GitHub:

* ArgoCD sees the new OmniCluster resource.
* ArgoCD "creates" this resource in the Management Cluster.
* The Omni Controller (the Agent's infrastructure specialist) sees this request and begins provisioning physical or virtual machines to match your blueprint.

### 3. The Power of Scaling

Want to add more power? Don't log into a console. Just change `workerNodes.count` from 2 to 5 in your code and push. The Agent will notice the discrepancy and start the extra servers for you automatically.

How to add this to your project:
To make sure the Agent actually handles this, you need to ensure your ArgoCD Application is pointing to the folder containing your cluster definition.

If you are using an "App of Apps" pattern:
Add this entry to your main bootstrap file to tell the agent to watch for the cluster definition:

```YAML
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: infrastructure-cluster
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-repo/gitops-demo.git
    targetRevision: HEAD
    path: clusters/omni-definitions # Point this to your folder
  destination:
    server: https://kubernetes.default.svc
    namespace: omni-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Why emphasize this for the audience?

By including this, you show the audience that everything is recoverable. If the entire workload cluster is deleted, the Agent will simply see it's missing from the "Source of Truth" and rebuild it from scratch based on that single YAML file.
